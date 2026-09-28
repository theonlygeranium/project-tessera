-- Lane G (D-021): the last reason Access couldn't be granted for an invitation (retryable).
ALTER TABLE invitations ADD COLUMN access_error TEXT;
