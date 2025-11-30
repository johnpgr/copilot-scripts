import { User } from "./types";
import { log } from "./logger";

export class UserService {
  private users: User[] = [];

  createUser(name: string, email: string): User {
    const user: User = {
      id: this.users.length + 1,
      name,
      email,
      role: "user"
    };
    this.users.push(user);
    log(`Created user ${user.id}: ${user.name}`);
    return user;
  }

  findUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  makeAdmin(id: number) {
    const user = this.findUser(id);
    if (user) {
      user.role = "admin";
      log(`User ${id} is now an admin`);
    }
  }
}
