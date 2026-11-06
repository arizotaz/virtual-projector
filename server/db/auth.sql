-- Login and session system. Safe to re-run.
--
-- Hashing happens in the Node server (server/src/auth.ts), never here:
--   * passwords: scrypt, verified in Node against account.getCredentials
--   * session keys: SHA-256, so these procedures only ever see the hash
--
-- Apply with: mariadb -h <host> -u <user> -p <database> < server/db/auth.sql

-- Session IDs are 256 characters
ALTER TABLE sessions MODIFY sessionID varchar(256) NOT NULL;

-- Passwords live only in accounts
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Users log in with their email, and each user has at most one account
ALTER TABLE accounts
	DROP INDEX IF EXISTS accounts_unique,
	DROP COLUMN IF EXISTS username,
	ADD UNIQUE KEY IF NOT EXISTS accounts_userid_unique (userid);

DELIMITER //

-- Password hash for an email. No row = no account = the user can't log in.
CREATE OR REPLACE PROCEDURE `account.getCredentials`(
	IN p_email varchar(100)
)
BEGIN
	SELECT a.userid, a.password
	  FROM accounts a
	  JOIN users u ON u.id = a.userid
	 WHERE u.email = p_email;
END //

-- Give an existing user login credentials. p_passwordHash must already be hashed.
-- Has no permission check, so an API route calling this needs its own.
CREATE OR REPLACE PROCEDURE `account.create`(
	IN p_email        varchar(100),
	IN p_passwordHash varchar(512)
)
main: BEGIN
	DECLARE v_user_id UUID DEFAULT NULL;

	DECLARE EXIT HANDLER FOR 1062
	BEGIN
		SELECT FALSE AS success, 'That user already has an account' AS message;
	END;

	DECLARE EXIT HANDLER FOR SQLEXCEPTION
	BEGIN
		SELECT FALSE AS success, 'Unexpected error' AS message;
	END;

	SELECT u.id INTO v_user_id FROM users u WHERE u.email = p_email;

	IF v_user_id IS NULL THEN
		SELECT FALSE AS success, 'No user with that email' AS message;
		LEAVE main;
	END IF;

	INSERT INTO accounts (userid, password)
	VALUES (v_user_id, p_passwordHash);

	SELECT TRUE AS success, 'Account created' AS message;
END //

-- Store a new session. The event scheduler is off, so expired sessions are cleared here.
CREATE OR REPLACE PROCEDURE `session.create`(
	IN p_sessionID       varchar(256),
	IN p_sessionKeyHash  varchar(512),
	IN p_userid          UUID,
	IN p_lifetimeSeconds INT,
	IN p_ipAddress       varchar(40)
)
BEGIN
	DECLARE EXIT HANDLER FOR SQLEXCEPTION
	BEGIN
		SELECT FALSE AS success, 'Unexpected error' AS message;
	END;

	DELETE FROM sessions WHERE expiration <= NOW();

	INSERT INTO sessions (sessionID, sessionKey, userid, expiration, ipAddress)
	VALUES (p_sessionID, p_sessionKeyHash, p_userid,
	        NOW() + INTERVAL p_lifetimeSeconds SECOND, p_ipAddress);

	SELECT TRUE AS success, 'Session created' AS message;
END //

-- Log out. Needs the key hash as well, so a sessionID alone can't end a session.
CREATE OR REPLACE PROCEDURE `session.delete`(
	IN p_sessionID      varchar(256),
	IN p_sessionKeyHash varchar(512)
)
BEGIN
	DELETE FROM sessions
	 WHERE sessionID = p_sessionID
	   AND BINARY sessionKey = p_sessionKeyHash;
END //

-- Validates a session and returns its user, one row per role. No rows = invalid or expired.
CREATE OR REPLACE PROCEDURE `session.getUserData`(
	IN sesID  varchar(256),
	IN sesKey varchar(512)
)
BEGIN
	SELECT u.id,
		CONCAT_WS(' ', u.first_name, u.middle_initial, u.last_name) AS name,
		UPPER(LEFT(u.first_name, 1)) AS initial_first,
		u.email,
		r.id   AS permid,
		r.name AS perm_name
	FROM sessions s
	JOIN users u ON u.id = s.userid
	LEFT JOIN user_roles ur ON ur.userid = u.id
	LEFT JOIN roles r ON r.id = ur.roleid
	WHERE s.sessionID = sesID
	  AND BINARY s.sessionKey = sesKey
	  AND s.expiration > NOW();
END //

-- Existing procedures below: only the session checks changed (256-character ID, expiry enforced).

CREATE OR REPLACE PROCEDURE `teacher.classes.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512)
)
main: BEGIN
	DECLARE v_user_id UUID DEFAULT NULL;
	DECLARE v_level   INT DEFAULT NULL;

	-- Duplicate key (e.g. unique email)
	DECLARE EXIT HANDLER FOR 1062
	BEGIN
		SELECT FALSE AS success, 'A user with that email already exists' AS message;
	END;

	-- Anything unexpected: don't leak DB internals
	DECLARE EXIT HANDLER FOR SQLEXCEPTION
	BEGIN
		SELECT FALSE AS success, 'Unexpected error' AS message;
	END;

	-- Resolve the session and the caller's highest permission level
	SELECT u.id, MAX(r.id)
	  INTO v_user_id, v_level
	  FROM sessions s
	  JOIN users u ON u.id = s.userid
	  LEFT JOIN user_roles ur ON ur.userid = u.id
	  LEFT JOIN roles r ON r.id = ur.roleid
	 WHERE s.sessionID = p_sessionID
	   AND s.sessionKey = p_sessionKey
	   AND s.expiration > NOW()
	GROUP BY u.id;

	IF v_user_id IS NULL THEN
		SELECT FALSE AS success, 'Invalid or expired session' AS message;
		LEAVE main;
	END IF;

	IF v_level IS NULL OR v_level < 2 THEN
		SELECT FALSE AS success, 'Permission denied' AS message;
		LEAVE main;
	END IF;

	select * from sections s where s.lecturer = v_user_id;
END //

CREATE OR REPLACE PROCEDURE `user.create`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_name_first  varchar(100),
	IN p_name_middle varchar(100),
	IN p_name_last   varchar(100),
	IN p_email       varchar(64)
)
main: BEGIN
	DECLARE v_user_id UUID DEFAULT NULL;
	DECLARE v_level   INT DEFAULT NULL;

	-- Duplicate key (e.g. unique email)
	DECLARE EXIT HANDLER FOR 1062
	BEGIN
		SELECT FALSE AS success, 'A user with that email already exists' AS message;
	END;

	-- Anything unexpected: don't leak DB internals
	DECLARE EXIT HANDLER FOR SQLEXCEPTION
	BEGIN
		SELECT FALSE AS success, 'Unexpected error' AS message;
	END;

	-- Resolve the session and the caller's highest permission level
	SELECT u.id, MAX(r.id)
	  INTO v_user_id, v_level
	  FROM sessions s
	  JOIN users u ON u.id = s.userid
	  LEFT JOIN user_roles ur ON ur.userid = u.id
	  LEFT JOIN roles r ON r.id = ur.roleid
	 WHERE s.sessionID = p_sessionID
	   AND s.sessionKey = p_sessionKey
	   AND s.expiration > NOW();

	IF v_user_id IS NULL THEN
		SELECT FALSE AS success, 'Invalid or expired session' AS message;
		LEAVE main;
	END IF;

	IF v_level IS NULL OR v_level < 3 THEN
		SELECT FALSE AS success, 'Permission denied' AS message;
		LEAVE main;
	END IF;

	-- Basic input validation
	IF TRIM(IFNULL(p_name_first, '')) = ''
	   OR TRIM(IFNULL(p_name_last, '')) = ''
	   OR TRIM(IFNULL(p_email, '')) = '' THEN
		SELECT FALSE AS success, 'First name, last name, and email are required' AS message;
		LEAVE main;
	END IF;

	INSERT INTO users (first_name, middle_initial, last_name, email)
	VALUES (p_name_first, p_name_middle, p_name_last, p_email);

	SELECT TRUE AS success, 'User created' AS message, LAST_INSERT_ID() AS id;
END //

DELIMITER ;
