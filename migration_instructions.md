# Database Migration Instructions

To support the QR Code Login and Mandatory Password Change feature, please execute the following SQL command in your Supabase SQL Editor:

```sql
-- Add is_first_login column to teachers table
ALTER TABLE teachers 
ADD COLUMN is_first_login BOOLEAN DEFAULT TRUE;

-- Add is_first_login column to students table (optional, for consistency)
ALTER TABLE students 
ADD COLUMN is_first_login BOOLEAN DEFAULT TRUE;

-- Update existing records to reflect they are NOT first login (if desired)
-- UPDATE teachers SET is_first_login = FALSE;
-- UPDATE students SET is_first_login = FALSE;
```

This migration adds the necessary column to track whether a user needs to change their password upon first login.
