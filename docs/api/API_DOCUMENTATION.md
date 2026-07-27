# HappyDocs Example API

Example documentation generated directly from the Express fixture.

## Overview

- Version: `1.0.0`
- Base URL: `http://localhost:3000`
- Generated endpoints: **2**

## Authentication

`GET /users/:id` uses bearer authentication inferred from the `requireAuth` middleware.

## Table of contents

- [Users](#users)

## Users

### GET /users/:id

Retrieves a user by ID.

- Confidence: **high**
- Source: `examples/express/server.ts:9:1`
- Middleware: `requireAuth`

#### Parameters

| Name           | In    | Type   | Required | Description |
| -------------- | ----- | ------ | -------- | ----------- |
| `id`           | path  | string | Yes      |             |
| `includePosts` | query | string | No       |             |

#### Responses

- **200** — Successful response

### POST /users

- Confidence: **high**
- Source: `examples/express/server.ts:17:1`
- Middleware: `validateUser`

#### Request body

Content type: `application/json`

```json
{
  "email": "string"
}
```

#### Responses

- **201** — Successful response

## Documentation gaps

No unresolved route metadata was detected.
