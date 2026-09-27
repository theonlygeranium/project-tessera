import { useId } from 'react';
import { Button, ChoiceGroup, FormField, Select, TextArea, TextInput } from '../../../components';
import { LIMITS, moveItem, nodeOptionLabel, pointsNowhere, uniqueId, type ScenarioChoice, type ScenarioContent, type ScenarioNode } from '../model';
import { ItemActions } from './actions';
import styles from './editors.module.css';

export function ScenarioEditor({ value, onChange }: { value: ScenarioContent; onChange: (value: ScenarioContent) => void }) {
  const nodes = value.nodes;
  const nodeIds = nodes.map((node) => node.id);
  const writeNodes = (next: ScenarioNode[], startNodeId = value.startNodeId) => onChange({ ...value, nodes: next, startNodeId });

  const updateNode = (index: number, patch: Partial<ScenarioNode>) => {
    const current = nodes[index];
    let next = nodes.map((node, i) => i === index ? { ...node, ...patch } : node);
    let startNodeId = value.startNodeId;
    if (patch.id !== undefined && patch.id !== current.id) {
      const oldId = current.id;
      const newId = patch.id;
      next = next.map((node) => ({
        ...node,
        choices: node.choices.map((choice) => choice.nextNodeId === oldId ? { ...choice, nextNodeId: newId } : choice),
      }));
      if (startNodeId === oldId) startNodeId = newId;
    }
    writeNodes(next, startNodeId);
  };

  const removeNode = (index: number) => {
    if (nodes.length <= 1) return;
    const removed = nodes[index].id;
    const next = nodes.filter((_, i) => i !== index);
    const startNodeId = value.startNodeId === removed ? next[0].id : value.startNodeId;
    writeNodes(next, startNodeId);
  };

  return <div className={styles.editor}>
    <FormField label="Title" required>{control => <TextInput {...control} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} />}</FormField>
    <FormField label="Setting" hint="The scene students read before the first choice.">{control => <TextArea {...control} value={value.setting} onChange={e => onChange({ ...value, setting: e.target.value })} />}</FormField>
    <FormField label="Starting step" required error={nodeIds.includes(value.startNodeId) ? undefined : 'Choose a step that exists.'}>{control => <Select {...control} value={value.startNodeId} onChange={e => onChange({ ...value, startNodeId: e.target.value })}>
      {nodes.map((node, index) => <option key={`${index}-${node.id}`} value={node.id}>{nodeOptionLabel(node)}</option>)}
      {!nodeIds.includes(value.startNodeId) && <option value={value.startNodeId}>{value.startNodeId} (missing step)</option>}
    </Select>}</FormField>
    <div className={styles.stack}>
      {nodes.map((node, index) => <NodeFields key={index} node={node} index={index} count={nodes.length} nodeIds={nodeIds} nodes={nodes} duplicate={nodes.filter((item) => item.id === node.id).length > 1} onChange={patch => updateNode(index, patch)} onMove={(i, offset) => writeNodes(moveItem(nodes, i, offset))} onRemove={removeNode} />)}
      <div className={styles.toolbar}>
        <Button density="compact" disabled={nodes.length >= LIMITS.nodes} onClick={() => {
          const id = uniqueId('step', nodeIds);
          writeNodes([...nodes, { id, text: '', outcome: '', choices: [] }], nodeIds.includes(value.startNodeId) ? value.startNodeId : id);
        }}>Add step</Button>
      </div>
    </div>
  </div>;
}

function NodeFields({ node, index, count, nodeIds, nodes, duplicate, onChange, onMove, onRemove }: {
  node: ScenarioNode;
  index: number;
  count: number;
  nodeIds: string[];
  nodes: ScenarioNode[];
  duplicate: boolean;
  onChange: (patch: Partial<ScenarioNode>) => void;
  onMove: (index: number, offset: number) => void;
  onRemove: (index: number) => void;
}) {
  const ending = node.choices.length === 0;
  const addChoice = () => {
    if (node.choices.length >= LIMITS.choices) return;
    const elsewhere = nodes.find((item) => item.id !== node.id && item.id)?.id ?? node.id;
    const choice: ScenarioChoice = {
      id: uniqueId('choice', node.choices.map((item) => item.id)),
      text: '',
      nextNodeId: elsewhere,
      feedback: '',
      quality: 'okay',
    };
    onChange({ choices: [...node.choices, choice] });
  };
  return <fieldset className={styles.item}>
    <legend className={styles.legend}>Step {index + 1}{ending ? ' (ending)' : ''}</legend>
    <FormField label="Step id" required error={duplicate ? 'Step ids must be unique.' : undefined} hint="Shown in the list of where a choice leads.">{control => <TextInput {...control} value={node.id} onChange={e => onChange({ id: e.target.value })} />}</FormField>
    <FormField label="Situation" required>{control => <TextArea {...control} value={node.text} onChange={e => onChange({ text: e.target.value })} />}</FormField>
    <FormField label="Outcome" hint={ending ? 'Students see this when the step has no choices.' : 'Used when this step has no choices.'}>{control => <TextArea {...control} value={node.outcome} onChange={e => onChange({ outcome: e.target.value })} />}</FormField>
    <div className={styles.stack}>
      {node.choices.map((choice, choiceIndex) => <ChoiceFields key={choiceIndex} choice={choice} index={choiceIndex} count={node.choices.length} nodes={nodes} onChange={patch => onChange({ choices: node.choices.map((item, i) => i === choiceIndex ? { ...item, ...patch } : item) })} onMove={(i, offset) => onChange({ choices: moveItem(node.choices, i, offset) })} onRemove={i => onChange({ choices: node.choices.filter((_, index) => index !== i) })} />)}
      <div className={styles.toolbar}>
        <Button density="compact" disabled={node.choices.length >= LIMITS.choices} onClick={addChoice}>Add choice</Button>
      </div>
    </div>
    <ItemActions label={`step ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
  </fieldset>;
}

function ChoiceFields({ choice, index, count, nodes, onChange, onMove, onRemove }: {
  choice: ScenarioChoice;
  index: number;
  count: number;
  nodes: ScenarioNode[];
  onChange: (patch: Partial<ScenarioChoice>) => void;
  onMove: (index: number, offset: number) => void;
  onRemove: (index: number) => void;
}) {
  const qualityName = useId();
  const nodeIds = nodes.map((node) => node.id);
  const missing = pointsNowhere(choice.nextNodeId, nodeIds);
  return <fieldset className={`${styles.item} ${styles.nested}`}>
    <legend className={styles.legend}>Choice {index + 1}</legend>
    <FormField label="Choice text" required>{control => <TextInput {...control} value={choice.text} onChange={e => onChange({ text: e.target.value })} />}</FormField>
    <FormField label="Leads to" required error={missing ? 'This choice points to a missing step.' : undefined}>{control => <Select {...control} value={choice.nextNodeId} onChange={e => onChange({ nextNodeId: e.target.value })}>
      {nodes.map((node, nodeIndex) => <option key={`${nodeIndex}-${node.id}`} value={node.id}>{nodeOptionLabel(node)}</option>)}
      {missing && <option value={choice.nextNodeId}>{choice.nextNodeId ? `${choice.nextNodeId} (missing step)` : '(missing step)'}</option>}
    </Select>}</FormField>
    <FormField label="Feedback">{control => <TextArea {...control} value={choice.feedback} onChange={e => onChange({ feedback: e.target.value })} />}</FormField>
    <ChoiceGroup
      legend="Quality of this choice"
      type="radio"
      name={qualityName}
      options={[
        { value: 'best', label: 'Best' },
        { value: 'okay', label: 'Okay' },
        { value: 'poor', label: 'Poor' },
      ]}
      value={choice.quality}
      onChange={next => {
        const quality = Array.isArray(next) ? next[0] : next;
        if (quality === 'best' || quality === 'okay' || quality === 'poor') onChange({ quality });
      }}
    />
    <ItemActions label={`choice ${index + 1}`} index={index} count={count} canRemove onMove={onMove} onRemove={onRemove} />
  </fieldset>;
}
