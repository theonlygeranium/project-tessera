import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculate } from '../../../../shared/grading/engine';
import { goldenInput } from '../../../../shared/grading/golden.fixture';
import { CalculationTrace } from './CalculationTrace';

describe('CalculationTrace', () => {
  it('renders Priya’s golden contributions and arithmetic', () => {
    const html = renderToStaticMarkup(<CalculationTrace trace={calculate(goldenInput('u-priya'))} name="Priya Natarajan" />);
    for (const value of ['14.50', '17.00', '16.20', '36.00', '83.70 ÷ 95 = 88.1% → B+ (87.0 to 89.9)']) expect(html).toContain(value);
    expect(html).toContain('Priya Natarajan');
  });
});
