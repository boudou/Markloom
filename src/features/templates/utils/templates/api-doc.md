# API Documentation

## Base URL

```
https://api.example.com/v1
```

## Authentication

All requests require an API key in the header:

```
Authorization: Bearer YOUR_API_KEY
```

## Endpoints

### GET /resource

Returns a list of resources.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

**Response**

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "total": 100
  }
}
```

### POST /resource

Creates a new resource.

**Request Body**

```json
{
  "name": "string",
  "description": "string"
}
```

**Response**

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "createdAt": "string"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Server Error |
