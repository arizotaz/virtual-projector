# Virtual Projector API Reference

This file documents every API the server exposes: the REST routes, the Socket.IO events, and the routes that exist in code but are switched off.

It describes what the code currently does, including behaviour that looks unintended. Those cases are marked ⚠️ and collected in [Known issues](#known-issues).

## Contents

- [Quick reference](#quick-reference)
- [Using the API](#using-the-api)
- [General routes](#general-routes)
- [Admin routes](#admin-routes)
- [Teacher routes](#teacher-routes)
- [Student routes](#student-routes)
- [Client app fallback](#client-app-fallback)
- [Socket.IO API](#socketio-api)
- [Disabled routes](#disabled-routes)
- [Known issues](#known-issues)

## Quick reference

### REST routes

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| GET | `/health` | Public | Check that the server is running |
| GET | `/me` | Public | Get the logged-in user |
| POST | `/login` | Public | Log in and set the session cookie |
| GET | `/logout` | Public | End the session and clear the cookie |
| POST | `/admin/new_admin` | Admin | Create an administrator |
| POST | `/admin/new_teacher` | Admin | Create a teacher |
| POST | `/admin/new_student` | Admin | Create a student |
| GET | `/admin/get_users` | Admin | List users, 10 per page |
| POST | `/admin/delete_user` | Admin | Delete a user |
| GET | `/teacher/get_classes` | Teacher | List the teacher's own sections |
| POST | `/teacher/get_students` | Teacher | List the students in a section |
| POST | `/teacher/add_student` | Teacher | Enroll a student in a section |
| POST | `/teacher/remove_student` | Teacher | Remove a student from a section |
| POST | `/teacher/add_class` | Teacher | Create a class and its first section |
| POST | `/teacher/remove_class` | Teacher | Delete a class and all its sections |
| POST | `/teacher/add_section` | Teacher | Add a section to a class |
| POST | `/teacher/remove_section` | Teacher | Delete a section |
| GET | `/student/get_enrollments` | Student | List the student's enrollments |
| GET | Any other path | Public | Serve the React app, if it has been built |

"Admin" means the `Administrator` or `Super` role.

### Socket.IO events

| Direction | Event | Purpose |
| --------- | ----- | ------- |
| Client → server | `room:join` | Join a section's room as `viewer`, or as `source` if you're its lecturer |
| Client → server | `room:leave` | Leave the current room |
| Client → server | `relay:signal` | Send WebRTC signaling data to a parent or child |
| Client → server | `relay:parent-failed` | Ask for a different parent |
| Client → server | `relay:status` | Report this node's connection status |
| Client → server | `room:watch` | Subscribe to a room's tree updates (admins only) |
| Client → server | `room:unwatch` | Unsubscribe from a room's tree updates |
| Server → client | `relay:set-parent` | Tell a node where to receive the stream from |
| Server → client | `relay:add-child` | Tell a node to start forwarding to a child |
| Server → client | `relay:remove-child` | Tell a node to stop forwarding to a child |
| Server → client | `relay:signal` | Deliver WebRTC signaling data |
| Server → client | `room:tree` | Send the current tree layout |

## Using the API

### Base URL

The paths in this file are the paths Express sees. The URL you call depends on how the server is running:

| Environment | How to call `/me` | Notes |
| ----------- | ----------------- | ------- |
| Docker with nginx | `/api/me` | nginx removes the `/api` prefix (`site.conf`) |
| Direct to the server | `http://localhost:3000/me` | The port comes from `PORT` and defaults to 3000 |
| Vite dev server | Set `VITE_BACK_END_HOST` to the backend URL | The Vite `/api` proxy doesn't work for REST calls ([issue 11](#known-issues)) |

In client code, `GetBackendStr("/me")` in `client/src/utilities/browser_utils.ts` builds the right URL.

### Request format

- **POST bodies:** send JSON (`Content-Type: application/json`) or URL-encoded form data. The client uses JSON.
- **Query strings:** only `GET /admin/get_users` reads one.
- **Validation:** there is no schema validation. Any type or length rules listed here come from the database or from the handler's own checks.

### Authentication

Authentication uses an HTTP-only cookie named `sid`, set by `POST /login`.

- **Contents:** the cookie holds the session ID, encrypted with AES-256-GCM using a key derived from `COOKIE_SECRET`.
- **Lifetime:** 7 days. The same expiry is stored in the `sessions` table.
- **Cookie flags:** `HttpOnly`, `SameSite=Lax`, and `Secure` is off.
- **Cross-origin calls:** browser clients must send `credentials: "include"`.

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"your-password"}' \
  http://localhost:3000/login
```

```bash
curl -b cookies.txt http://localhost:3000/me
```

### Roles

| ID | Name | Can use |
| -- | ---- | ------- |
| 0 | `Unknown` | Public routes only. Used when a user has no role row |
| 1 | `Student` | `/student/*` |
| 2 | `Teacher` | `/teacher/*` |
| 3 | `Administrator` | `/admin/*` |
| 4 | `Super` | `/admin/*`, and can't be deleted |

Access checks are exact: an administrator gets `403` on `/teacher/*` and `/student/*`.

### CORS

CORS is only enabled when the server runs through `npm run dev`, and it then allows any origin with credentials. The Socket.IO server has no CORS configuration in any mode.

### Responses and errors

Most failures return **HTTP 200** with `success: false`, so check the body as well as the status code.

| Situation | Status | Body |
| --------- | ------ | ---- |
| Action completed | 200 | `{ "success": true, "message": "..." }` |
| Action failed, including most database errors | 200 | `{ "success": false, "message": "..." }` |
| List query failed | 200 | An empty list, which looks the same as having no results |
| No valid session on a protected route | 401 | `{ "success": false, "message": "Not authenticated" }` |
| Wrong role on a protected route | 403 | `{ "success": false, "message": "Access Denied" }` |
| POST with no parsable body | 500 | Plain text: `Server Error` |
| Malformed JSON | 400 | Express's default error response, not JSON from this API |

The role check runs on every path under `/admin`, `/teacher` and `/student`, including paths that don't exist.

## General routes

Defined in `server/src/index.ts`.

### `GET /health`

Checks that the server is running. It doesn't check the database.

**Response**

```json
{ "ok": true }
```

### `GET /me`

Returns the user for the current `sid` cookie. If the session has expired, it also deletes the session row.

The client calls this on load to decide what to show.

**Response when logged in**

```json
{
  "user": {
    "id": "0192f0c1-7a4b-7c3e-9d21-5f6a7b8c9d0e",
    "firstName": "Ada",
    "middleInitial": "B",
    "lastName": "Lovelace",
    "email": "ada@example.com",
    "role": "Teacher"
  }
}
```

**Response when not logged in**

The status is still 200, and `user` is left out:

```json
{}
```

### `POST /login`

Checks an email and password. On success, it creates a session and sets the `sid` cookie.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `email` | string | Yes | The account's email |
| `password` | string | Yes | The plaintext password, which the server hashes to compare |

**Responses**

All of these return HTTP 200 except the last:

| Case | Body |
| ---- | ---- |
| Success, with `sid` cookie set | `{ "success": true, "message": "Login Successful!" }` |
| Wrong email or password | `{ "success": false, "message": "Incorrect Email or Password" }` |
| Database error or missing password | `{ "success": false, "message": "Server Error" }` |
| No parsable body (HTTP 500) | Plain text: `Server Error` |

### `GET /logout`

Deletes the session row and clears the `sid` cookie. It succeeds even if you aren't logged in.

**Response**

Plain text, not JSON:

```text
You've been logged out!
```

## Admin routes

Defined in `server/src/routers/admin_routes.ts`, with logic in `server/src/admin_utils.ts` and `server/src/utils.ts`.

All of these require the `Administrator` or `Super` role.

### `POST /admin/new_admin`, `/admin/new_teacher`, `/admin/new_student`

Create a user with the role in the path: `Administrator`, `Teacher` or `Student`. The three routes take the same body. Any administrator can use all three, including `new_admin`.

**Body**

| Field | Type | Required | Limit | Description |
| ----- | ---- | -------- | ----- | ----------- |
| `firstName` | string | Yes | 100 characters | First name |
| `middleInitial` | string | No | 100 characters | Middle initial |
| `lastName` | string | No | 100 characters | Last name |
| `email` | string | Yes | 100 characters | Unique login email |
| `password` | string | Yes | None | Plaintext password, stored as a SHA-256 hash |

**Responses**

| Case | Body |
| ---- | ---- |
| Success | `{ "success": true, "message": "Created new Teacher!" }` (with the matching role name) |
| Email already in use | `{ "success": false, "message": "A user with that email already exists" }` |
| Missing or invalid field, or database error | `{ "success": false, "message": "Failed to Create Teacher" }` |

The user and their role are saved together in a transaction, so a failure leaves nothing behind. An existing user's password and roles are never changed by these routes.

### `GET /admin/get_users`

Lists users 10 at a time, highest role first, then by ID. The response has no total count, so a client finds the end by getting an empty or short page.

**Query parameters**

| Field | Type | Required | Default | Description |
| ----- | ---- | -------- | ------- | ----------- |
| `page` | integer | No | 1 | Page number. Invalid values fall back to 1 |

**Response**

```json
{
  "users": [
    {
      "id": "0192f0c1-7a4b-7c3e-9d21-5f6a7b8c9d0e",
      "firstName": "Ada",
      "middleInitial": "B",
      "lastName": "Lovelace",
      "email": "ada@example.com",
      "role": "Teacher"
    }
  ]
}
```

A user with several roles appears once, with their highest role. If the query fails, `users` is empty.

### `POST /admin/delete_user`

Deletes a user. Their sessions, roles and `accounts` rows are deleted with them.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `uid` | string (UUID) | Yes | ID of the user to delete |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Deleted | `true` | `Deleted User Successfully` |
| Deleting yourself | `false` | `Cannot Self-Delete` |
| Target is a `Super` user | `false` | `Cannot Delete Super-Admin` |
| Target doesn't exist | `false` | `User does not Exist` ⚠️ ([issue 8](#known-issues)) |
| Database error | `false` | `Failed to Delete User` |

Administrators can delete other administrators. ⚠️ Deleting a teacher who still has sections fails, and deleting a student leaves their enrollments behind ([issue 9](#known-issues)).

## Teacher routes

Defined in `server/src/routers/teacher_routes.ts`, with logic in `server/src/teacher_utils.ts`.

All of these require the `Teacher` role.

> **Ownership:** except for `get_classes`, these routes return `{ "success": false, "message": "Modification Denied" }` unless the teacher is the lecturer of the given section. `get_students` returns `{ "success": false, "students": [] }` instead, and `remove_class` only requires the teacher to lecture one section of the class.
>
> ⚠️ **`add_class` and `add_section` currently always fail,** because they run this check on a section that doesn't exist yet ([issue 1](#known-issues)).

A class is identified by its `crn` (up to 32 characters) and has one or more sections, each with a `section` ID of up to 5 characters. Each section has one lecturer.

### `GET /teacher/get_classes`

Lists the sections taught by the logged-in teacher, sorted by CRN and then section. A class with two sections appears twice.

**Response**

```json
{
  "classes": [
    { "crn": "12345", "name": "Intro to Computing", "section": "001" }
  ]
}
```

### `POST /teacher/get_students`

Lists the students enrolled in a section.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `crn` | string | Yes | Class CRN |
| `section` | string | Yes | Section ID |

**Response**

```json
{
  "success": true,
  "students": [
    {
      "id": "0192f0c1-7a4b-7c3e-9d21-5f6a7b8c9d0e",
      "email": "ada@example.com",
      "firstName": "Ada",
      "middleInitial": "B",
      "lastName": "Lovelace"
    }
  ]
}
```

On a database error, the response is `{ "success": false, "students": [] }`.

### `POST /teacher/add_student`

Enrolls an existing student in a section, looking them up by email. The user must have the `Student` role.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `email` | string | Yes | The student's email |
| `crn` | string | Yes | Class CRN |
| `section` | string | Yes | Section ID |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Enrolled | `true` | `Added Student Successfully` |
| No student with that email | `false` | `Student does not Exist` |
| Teacher isn't this section's lecturer, or the section doesn't exist | `false` | `Modification Denied` |
| Already enrolled, or database error | `false` | `Failed to Add Student` |

### `POST /teacher/remove_student`

Removes a student from a section. It reports success even if the student wasn't enrolled.

**Body**

The same as `add_student`: `email`, `crn` and `section`.

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Removed, or wasn't enrolled | `true` | `Removed Student Successfully` |
| Teacher isn't this section's lecturer, or the section doesn't exist | `false` | `Modification Denied` |
| No student with that email | `false` | `Student not Found` |
| Database error | `false` | `Failed to Remove Student` |

### `POST /teacher/add_class`

⚠️ This currently always returns `Modification Denied` and leaves a class row with no sections ([issue 1](#known-issues)).

It's meant to create a class and its first section, with the logged-in teacher as lecturer. If the `crn` already exists with the same `name`, it only adds the section.

**Body**

| Field | Type | Required | Limit | Description |
| ----- | ---- | -------- | ----- | ----------- |
| `name` | string | Yes | 512 characters | Class name |
| `crn` | string | Yes | 32 characters | Class CRN |
| `section` | string | Yes | 5 characters | First section ID |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Created | `true` | `Added new Class Successfully` |
| Teacher doesn't already lecture this section (currently every new section) | `false` | `Modification Denied` |
| Section already exists or is invalid | `false` | `Failed to Add Section` |
| `crn` exists with a different `name`, or database error | `false` | `Failed to Add Class` |

If the section step fails on a new CRN, the class row isn't rolled back, so it stays with no sections.

### `POST /teacher/remove_class`

Deletes a class, if the teacher lectures at least one of its sections. This also deletes **all** its sections, including those taught by other teachers, and all their enrollments.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `crn` | string | Yes | Class CRN |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Removed | `true` | `Removed Class Successfully` |
| Teacher has no section in this class, or the CRN doesn't exist | `false` | `Modification Denied` |
| Database error | `false` | `Failed to Remove Class` |

### `POST /teacher/add_section`

⚠️ This currently always fails for a new section ([issue 1](#known-issues)).

It's meant to add a section to an existing class, with the logged-in teacher as lecturer.

**Body**

| Field | Type | Required | Limit | Description |
| ----- | ---- | -------- | ----- | ----------- |
| `crn` | string | Yes | 32 characters | An existing class CRN |
| `section` | string | Yes | 5 characters | New section ID |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Added | `true` | `Section Added` |
| Teacher doesn't already lecture this section (currently every new section) | `false` | `Modification Denied` |
| Section already exists, or database error | `false` | `Failed to Add Section` |

### `POST /teacher/remove_section`

Deletes a section and its enrollments. The class stays, even if this was its last section.

**Body**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `crn` | string | Yes | Class CRN |
| `section` | string | Yes | Section ID |

**Responses**

| Case | `success` | `message` |
| ---- | --------- | --------- |
| Removed | `true` | `Removed Section Successfully` |
| Teacher isn't this section's lecturer, or the section doesn't exist | `false` | `Modification Denied` |
| Database error | `false` | `Failed to Remove Section` |

## Student routes

Defined in `server/src/routers/student_routes.ts`, with logic in `server/src/student_utils.ts`.

### `GET /student/get_enrollments`

Lists the sections the logged-in student is enrolled in, sorted by CRN and then section. Requires the `Student` role.

**Response**

```json
{
  "enrollments": [
    { "crn": "12345", "name": "Intro to Computing", "section": "001" }
  ]
}
```

If the query fails, `enrollments` is empty.

## Client app fallback

When `client/dist` exists at startup, the server also serves the React app:

- Files in `client/dist` are served as static assets.
- Any other `GET` request gets `index.html`, except paths under `/api/` and `/socket.io/`. This lets client-side routes load directly.

These are registered after the API routes, so they don't override them. An unknown `GET` path therefore returns the HTML page with status 200, not a 404.

## Socket.IO API

Defined in `server/src/index.ts` and `server/src/rooms.ts`. The payload types are in `shared/src/index.ts`.

The server connects viewers into a tree so they can share a stream over WebRTC. It only handles placement and signaling, and the media itself never passes through it.

- **Connecting:** use `io()` on the same origin, which uses the default `/socket.io/` path.
- **Authentication:** connections need a valid `sid` cookie, the same one the REST routes use. Otherwise the connection fails with a `connect_error` whose message is `Not authenticated`, and the client doesn't retry automatically. Open sockets aren't disconnected when a session ends ([issue 3](#known-issues)).
- **Same hostname:** the page and the socket must use the same hostname for the cookie to be sent. A cookie set on `localhost` isn't sent to `127.0.0.1`.
- **Permissions:**

  | Action | Who can do it |
  | ------ | ------------- |
  | Connect, or join as a `viewer` | Any logged-in user |
  | Join as a `source` (start a stream) | The `Teacher` assigned as lecturer of that section |
  | `room:watch` | `Administrator` and `Super` only |

- **Room names:** each class section has its own room, named by `ClassRoomName(crn, section)` in `shared/src/index.ts`. For CRN `12345` and section `001`, the room is `12345:001`. Viewers can join any room name, but only a real section's room can have a stream.

- **Node IDs:** a node's ID is its Socket.IO socket ID.

### How the tree works

1. A room is created when its first member joins, and removed when its last member leaves.
2. A room has at most one `source`, which is the root of the tree.
3. Each `viewer` gets one parent, and each node can forward to at most 3 children (`RELAY_MAX_CHILDREN`).
4. New viewers go under the shallowest node with a free slot, which keeps the tree shallow.
5. If there's no source or no free slot, the viewer waits. It gets `relay:set-parent` with `parentId: null` and is placed when a source joins.
6. When a node leaves, its direct children are placed again and keep their own children, so only one level has to reconnect.

### Typical flow

1. The client connects and emits `room:join`.
2. The server sends the viewer `relay:set-parent`, and sends its parent `relay:add-child`.
3. The parent creates a WebRTC offer and sends it with `relay:signal`.
4. The viewer replies with an answer, and both sides exchange ICE candidates using `relay:signal`.
5. Each node reports progress with `relay:status`.
6. If the connection to the parent fails, the viewer emits `relay:parent-failed` and is given a new parent.

### Client → server events

Most invalid events are silently ignored. Only `room:join` returns a result.

#### `room:join`

Joins a room, leaving any room the socket is already in. The session and role are checked in the database on every join, so the role can't be set by the client.

```ts
socket.emit("room:join", { room: ClassRoomName("12345", "001"), role: "viewer" }, (result) => {
  // { ok: true, nodeId: "<socket id>" } or { ok: false, error: "..." }
});
```

| Field | Type | Rules |
| ----- | ---- | ----- |
| `room` | string | 1 to 64 characters |
| `role` | string | `source` or `viewer` |
| Acknowledgement callback | function | Required. Without one, the event is ignored |

Possible errors are `Invalid room name`, `Invalid role`, `Not authenticated`, `Only the teacher assigned to this class can start its stream` and `Room already has a source`.

Assignment is per section, using `sections.lecturer`, so a teacher can't stream another teacher's section of the same class. Reassigning a section takes effect on the next join, and doesn't stop a stream already running.

⚠️ Viewers aren't checked against enrollment, so any logged-in user can watch any section's stream ([issue 2](#known-issues)).

#### `room:leave`

Leaves the current room. It takes no payload. Disconnecting has the same effect.

#### `relay:signal`

Sends WebRTC signaling data to another node. It's only delivered if the sender and target are a direct parent and child in the same room. Anything else is dropped.

```ts
socket.emit("relay:signal", { to: "<node id>", signal });
```

`signal` takes one of these forms:

```ts
{ type: "offer" | "answer", sdp: string }

{
  type: "candidate",
  candidate: {
    candidate: string,
    sdpMid?: string | null,
    sdpMLineIndex?: number | null,
    usernameFragment?: string | null
  }
}
```

#### `relay:parent-failed`

Reports that the connection to the current parent failed. It takes no payload. The server detaches the node and places it again, avoiding the failed parent if another slot is available.

#### `relay:status`

Reports this node's connection status, which appears in `room:tree`.

| Field | Type | Values |
| ----- | ---- | ------ |
| `status` | string | `connecting`, `waiting`, `receiving`, `live` or `error` |

#### `room:watch`

Subscribes to a room's tree updates without joining it. The server immediately sends the current `room:tree`, even if the room doesn't exist yet. It's meant for a debug page, and the current client doesn't use it.

Only `Administrator` and `Super` users can use it. For anyone else, the event is silently ignored.

| Field | Type | Rules |
| ----- | ---- | ----- |
| `room` | string | 1 to 64 characters |

#### `room:unwatch`

Stops the updates started by `room:watch`. The payload is `{ room: string }`.

### Server → client events

#### `relay:set-parent`

Tells a node which parent to receive the stream from. `null` means there is no parent yet, so it should wait.

```json
{ "parentId": "<node id or null>" }
```

#### `relay:add-child`

Tells a node to start forwarding to a new child. The parent sends the WebRTC offer.

```json
{ "childId": "<node id>" }
```

#### `relay:remove-child`

Tells a node to stop forwarding to a child.

```json
{ "childId": "<node id>" }
```

#### `relay:signal`

Delivers signaling data from a direct parent or child. `signal` has the same forms as the client event.

```json
{ "from": "<node id>", "signal": { "type": "answer", "sdp": "..." } }
```

#### `room:tree`

Sends the current tree to the room's source and to any watchers. It's sent whenever the tree or a node's status changes.

```json
{
  "room": "12345:001",
  "sourceId": "<node id or null>",
  "nodes": [
    {
      "id": "<node id>",
      "role": "viewer",
      "parentId": "<node id or null>",
      "status": "live",
      "joinedAt": 1793923200000
    }
  ]
}
```

### Declared but not implemented

`shared/src/index.ts` declares a client `ping` event and a server `pong` event, but the server neither handles nor sends them.

## Disabled routes

`server/src/auth.ts` defines Microsoft single sign-on routes, but the code that mounts them in `server/src/index.ts` is commented out. **These all currently fall through to the [client app fallback](#client-app-fallback) or return 404.**

| Method | Path | Intended purpose |
| ------ | ---- | ---------------- |
| GET | `/auth/login` | Redirect to Microsoft to sign in |
| GET | `/auth/callback` | Handle the redirect back from Microsoft and set a `session` cookie |
| GET | `/auth/me` | Return the SSO user, or 401 |
| POST | `/auth/logout` | Clear the `session` cookie |
| GET | `/profile` | Example route protected by `requireAuth` |

The login page already contains a hidden link to `/api/auth/login`.

Mounting these won't be enough to make them work: they use signed cookies, but `cookieParser()` is called without a secret ([issue 10](#known-issues)).

## Known issues

Unless an issue says it was confirmed by testing, it comes from reading the code.

### Security

1. **Teachers can't create classes or sections (high).** `AddSection` in `server/src/teacher_utils.ts` requires the teacher to already lecture the section being created, so every new section is denied. `AddClass` calls `AddSection`, so it fails too, and it has already saved the class row by then, leaving a class with no sections. Confirmed by testing. `AddSection` needs its own rule, such as allowing any teacher to add a section unless another teacher already teaches that class.

2. **Stream viewers aren't checked against enrollment (medium).** Only starting a stream is restricted to the section's lecturer. Any logged-in user can join any section's room as a `viewer` and watch.

3. **Open sockets outlive their session (medium).** Sessions are checked when connecting, on `room:join` and on `room:watch`. A user who logs out, or whose session expires, stays in their current room until the socket disconnects.

4. **Passwords use unsalted SHA-256 (high).** This is fast to brute-force, and identical passwords produce identical hashes. The schema marks it as temporary. `scrypt` is already available in `node:crypto`, and `bcrypt` and `argon2` are common alternatives.

5. **The session cookie isn't marked `Secure` (medium).** `/login` sets `secure: false`, although the comment beside it says "HTTPS only". Production over HTTPS should set it to `true`.

6. **Session IP addresses are wrong behind nginx (low).** Express's `trust proxy` isn't set, so `req.ip` records nginx's address rather than the client's.

7. **Logout uses `GET` (low).** Another site could log a user out by linking to it, because `SameSite=Lax` cookies are sent on top-level navigation.

### Incorrect behaviour

8. **`delete_user` probably reports success for users that don't exist.** The lookup uses `max()` with no `GROUP BY`, and SQL returns one row for that kind of query even when nothing matches. The `User does not Exist` branch is then unreachable, the delete affects nothing, and the response is `Deleted User Successfully`.

9. **User deletion doesn't handle related records.** `sections.lecturer` has no cascade, so deleting a teacher with sections fails with `Failed to Delete User`. `enrollments.studentid` has no foreign key, so deleting a student leaves their enrollment rows behind.

10. **The SSO routes will fail if mounted.** `auth.ts` sets `signed: true` cookies, and Express throws an error when signing without a secret. `cookieParser()` needs to be given one.

### Documentation and configuration

11. **The Vite `/api` proxy doesn't work for REST calls.** `client/vite.config.ts` forwards `/api/me` without removing the prefix, and Express has no `/api` routes. Local development currently needs `VITE_BACK_END_HOST` set. Adding a `rewrite` to the proxy would fix this.

12. **The README has the wrong port.** It says the backend defaults to port 4000, but the code and Vite proxy use 3000.

13. **The error message for a missing secret has the wrong name.** `server/src/utils.ts` checks `COOKIE_SECRET`, but the message says `COOKIE_SEC is not set`.
