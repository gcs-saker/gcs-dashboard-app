UPDATE registered_devices
SET status = 'disabled',
    updated_at = CURRENT_TIMESTAMP
WHERE UPPER(status) = 'INACTIVE';
