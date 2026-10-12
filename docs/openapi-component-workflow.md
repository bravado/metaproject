# OpenAPI → component workflow

This example shows the intended agent workflow for a small evolving user-management surface.

## 1. Start from the contract

Assume the configured OpenAPI document already contains:

```yaml
paths:
  /users:
    get:
      operationId: listUsers
      x-project-id: op-list-users
      responses:
        '200':
          description: Users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
              example:
                - { id: 1, name: Ada }
                - { id: 2, name: Grace }

  /users/{id}:
    get:
      operationId: getUser
      x-project-id: op-get-user
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              example: { id: 1, name: Ada }

    patch:
      operationId: updateUser
      x-project-id: op-update-user
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              example: { id: 1, name: Ada Lovelace }
```

The component workflow may use these operations. It must not invent an operation such as `archiveUser` unless that capability is first added to the configured OpenAPI contract.

## 2. Group operations by reusable workflow

The three operations do not imply three components. A useful grouping is:

- `user-list`: list users and emit host-level row intent;
- `user-editor`: load one user and update it.

`components/user-list/component.html`:

```html
<title>Users</title>
<data-source request="listUsers">
  <data-table>
    <button data-action="edit">Edit</button>
  </data-table>
</data-source>
```

`components/user-editor/component.html`:

```html
<title>User — ${id}</title>
<component-property name="id" type="integer" required example="1"></component-property>

<data-source request="getUser" id=${id}>
  <data-form>
    <button data-operation="updateUser">Save</button>
  </data-form>
</data-source>
```

The public `id` property and `edit` semantic event are component contracts. They should not change just because OpenAPI internals are updated.

## 3. Rerun after the API evolves

Suppose the backend changes `updateUser` from `PATCH /users/{id}` to `PUT /users/{id}`, while keeping the same `operationId` and behavior.

Application analysis should update only the stale method/path details in OpenAPI and preserve the stable `operationId`, `x-project-id`, examples, and unrelated contract sections where they remain valid.

Component creation should inspect the existing source before editing. Because `user-editor` still refers to `updateUser`, it may require no component change at all. Its hand-written markup, CSS, helper JavaScript, public `id` property, and semantic events remain untouched.

If a new `archiveUser` operation is later added to OpenAPI and belongs in the list workflow, the agent may add an archive action to the existing `user-list`. If the backend removes `updateUser` without a replacement, the agent must report that the editor's required capability is no longer modeled rather than inventing a substitute operation.

Finish by validating the focused update:

```bash
npx metaproject check
npx metaproject build
```
