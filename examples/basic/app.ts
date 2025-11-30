import { UserService } from "./user-service";

function main() {
  const service = new UserService();
  
  const alice = service.createUser("Alice", "alice@example.com");
  const bob = service.createUser("Bob", "bob@example.com");

  service.makeAdmin(alice.id);

  console.log(service.findUser(alice.id));
}

main();

// Refactor task:
// Change User.id from number to string (UUID).
// Update the User interface, UserService generation logic (use crypto.randomUUID() or a placeholder), and all lookups.
