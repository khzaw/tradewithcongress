# Infrastructure

Read `../PROJECT_CONTEXT.md` first for the broader product and architecture context.

Current deployment target:

- Oracle Cloud Always Free Linux VM
- Docker Compose on the VM

Planned deployment model:

- push to `main`
- CI builds and validates artifacts
- production host updates containers with a simple Compose-based rollout
