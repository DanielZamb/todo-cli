INSERT INTO users VALUES
('work','Work','retired-hash','active','2026-10-01T08:00:00Z','2026-10-01T08:00:00Z'),
('personal','Personal','retired-hash','active','2026-10-01T08:00:00Z','2026-10-01T08:00:00Z');
INSERT INTO sessions VALUES ('old-session','work','retired-token','2026-12-01T00:00:00Z','2026-10-01T08:00:00Z',NULL);
INSERT INTO tasks VALUES
('legacy-1','work',1,7,'Ship the port','Preserve metadata','open','Port','P1','2026-10-27T09:00:00-05:00','2026-10-28T00:00:00Z','FREQ=DAILY',4,45,'agent','2026-10-01T08:00:00Z','2026-10-26T12:00:00Z',NULL),
('legacy-2','personal',1,2,'Buy tea',NULL,'done',NULL,'P3',NULL,NULL,NULL,NULL,NULL,'manual','2026-10-02T08:00:00Z','2026-10-03T08:00:00Z','2026-10-03T08:00:00Z');
INSERT INTO task_tags VALUES ('legacy-1','focus'),('legacy-1','port'),('legacy-2','home');
