-- Teacher panel procedures. Safe to re-run. Applied by `npm run db:init`, after classes.sql.
--
-- Every procedure takes the caller's session and checks it itself.
--
-- Failures are raised with SIGNAL. The last three digits of the SQLSTATE are the HTTP status the
-- API responds with, and MESSAGE_TEXT is shown to the teacher:
--   45400 invalid input, 45401 not logged in, 45403 not allowed, 45404 not found, 45409 conflict
--
-- Role ids: 1 Student, 2 Teacher, 3 Administrator (or above)
-- A teacher can only work with the sections they teach. Administrators can work with any section.

-- A user as the teacher panel sees them. roles is a JSON array, or NULL with none.
CREATE OR REPLACE VIEW teacher_users AS
SELECT u.id, u.first_name, u.middle_initial, u.last_name, u.email,
	EXISTS (SELECT 1 FROM accounts a WHERE a.userid = u.id) AS has_account,
	(SELECT JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'name', r.name))
	   FROM user_roles ur JOIN roles r ON r.id = ur.roleid
	  WHERE ur.userid = u.id) AS roles
FROM users u;

DELIMITER //

-- ---------------------------------------------------------------------------
-- Permission checks, called by every procedure below
-- ---------------------------------------------------------------------------

-- The caller must have a valid session and be a Teacher (role 2) or above
CREATE OR REPLACE PROCEDURE `teacher.authorize`(
	IN  p_sessionID  varchar(256),
	IN  p_sessionKey varchar(512),
	OUT p_actor      UUID,
	OUT p_level      INT
)
BEGIN
	SET p_actor = NULL;
	SET p_level = NULL;

	SELECT s.userid, MAX(ur.roleid)
	  INTO p_actor, p_level
	  FROM sessions s
	  LEFT JOIN user_roles ur ON ur.userid = s.userid
	 WHERE s.sessionID = p_sessionID
	   AND BINARY s.sessionKey = p_sessionKey
	   AND s.expiration > NOW()
	 GROUP BY s.userid;

	IF p_actor IS NULL THEN
		SIGNAL SQLSTATE '45401' SET MESSAGE_TEXT = 'Not logged in';
	END IF;
	IF p_level IS NULL OR p_level < 2 THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'Permission denied';
	END IF;
END //

-- As above, and the section must exist and be taught by the caller (or the caller is an administrator)
CREATE OR REPLACE PROCEDURE `teacher.authorizeSection`(
	IN  p_sessionID  varchar(256),
	IN  p_sessionKey varchar(512),
	IN  p_crn        varchar(32),
	IN  p_sectionid  varchar(5),
	OUT p_actor      UUID,
	OUT p_level      INT
)
BEGIN
	DECLARE v_lecturer UUID DEFAULT NULL;

	CALL `teacher.authorize`(p_sessionID, p_sessionKey, p_actor, p_level);

	SELECT lecturer INTO v_lecturer
	  FROM sections
	 WHERE crn = p_crn AND sectionid = p_sectionid;

	IF v_lecturer IS NULL THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Section not found';
	END IF;
	IF v_lecturer <> p_actor AND p_level < 3 THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You don''t teach this section';
	END IF;
END //

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- Students, for choosing one to enroll.
-- p_search matches name or email; p_roleid limits to one role. NULL or '' means no filter.
CREATE OR REPLACE PROCEDURE `teacher.users.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_search     varchar(255),
	IN p_roleid     INT
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `teacher.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT u.*
	  FROM teacher_users u
	 WHERE EXISTS (SELECT 1 FROM user_roles ur WHERE ur.userid = u.id AND ur.roleid = 1)
	   AND (IFNULL(p_search, '') = ''
	        OR CONCAT_WS(' ', u.first_name, u.middle_initial, u.last_name) LIKE CONCAT('%', p_search, '%')
	        OR u.email LIKE CONCAT('%', p_search, '%'))
	   AND (p_roleid IS NULL
	        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.userid = u.id AND ur.roleid = p_roleid))
	 ORDER BY u.last_name, u.first_name, u.email;
END //

-- ---------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE `teacher.section.students`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `teacher.authorizeSection`(p_sessionID, p_sessionKey, p_crn, p_sectionid, v_actor, v_level);

	SELECT u.*
	  FROM enrollments e
	  JOIN teacher_users u ON u.id = e.studentid
	 WHERE e.crn = p_crn AND e.sectionid = p_sectionid
	 ORDER BY u.last_name, u.first_name, u.email;
END //

CREATE OR REPLACE PROCEDURE `teacher.enrollment.add`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_studentid  UUID,
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'That student is already enrolled in this section';

	CALL `teacher.authorizeSection`(p_sessionID, p_sessionKey, p_crn, p_sectionid, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM user_roles WHERE userid = p_studentid AND roleid = 1) THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'That user is not a student';
	END IF;

	INSERT INTO enrollments (studentid, crn, sectionid) VALUES (p_studentid, p_crn, p_sectionid);
END //

CREATE OR REPLACE PROCEDURE `teacher.enrollment.remove`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_studentid  UUID,
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `teacher.authorizeSection`(p_sessionID, p_sessionKey, p_crn, p_sectionid, v_actor, v_level);

	DELETE FROM enrollments
	 WHERE studentid = p_studentid AND crn = p_crn AND sectionid = p_sectionid;
END //

DELIMITER ;