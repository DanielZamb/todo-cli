export const profileMigrationSql = `
CREATE TABLE profile_deletions (
  profile TEXT PRIMARY KEY REFERENCES profiles(id), deleted_at TEXT NOT NULL
);
CREATE TRIGGER profile_deletions_domain_insert BEFORE INSERT ON profile_deletions
WHEN domain_write_allowed() != 1 BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER profile_deletions_no_update BEFORE UPDATE ON profile_deletions
BEGIN SELECT RAISE(ABORT, 'Profile deletion is final'); END;
CREATE TRIGGER profile_deletions_domain_delete BEFORE DELETE ON profile_deletions
WHEN domain_write_allowed() != 1 BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER profiles_reserved_insert BEFORE INSERT ON profiles
WHEN EXISTS (SELECT 1 FROM profile_deletions d JOIN profiles p ON p.id=d.profile WHERE p.id=NEW.id)
BEGIN SELECT RAISE(ABORT, 'Deleted Profile IDs cannot be reused'); END;
CREATE TRIGGER profiles_reserved_update BEFORE UPDATE ON profiles
WHEN EXISTS (SELECT 1 FROM profile_deletions d JOIN profiles p ON p.id=d.profile WHERE p.id=NEW.id)
BEGIN SELECT RAISE(ABORT, 'Deleted Profile IDs cannot be reused'); END;
PRAGMA user_version=4;
`;
