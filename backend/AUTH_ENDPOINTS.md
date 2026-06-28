# Auth Endpoints

## 1) POST /auth/login

### Request

```json
{
  "token": "string"
}
```

### Success (200)

```json
{
  "access_token": "string",
  "token_type": "bearer",
  "user": {
    "id": "string",
    "firebase_uid": "string",
    "email": "string",
    "name": "string",
    "picture": "string"
  }
}
```

### Errors

- 400

```json
{ "error": "token is required" }
```

- 401

```json
{ "error": "Invalid Firebase token" }
```

## 2) POST /auth/logout

### Success (200)

```json
{ "message": "Logged out successfully" }
```

## 3) GET /api/auth/me

Protected route (Firebase auth middleware).

### Success (200)

```json
{
  "id": "string",
  "email": "string",
  "name": "",
  "picture": ""
}
```

### Auth Errors (401)

```json
{ "error": "missing Authorization header" }
```

```json
{ "error": "Authorization must be: Bearer <token>" }
```

```json
{ "error": "invalid or expired token" }
```

## 4) GET /api/auth/verify

Protected route (Firebase auth middleware).

### Success (200)

```json
{
  "valid": true,
  "user": {
    "id": "string",
    "email": "string"
  }
}
```

### Auth Errors (401)

Same as `/api/auth/me`.
