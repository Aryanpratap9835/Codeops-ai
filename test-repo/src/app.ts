import { fetchUser } from "./index";
import * as users from "./services";

function main() {
    fetchUser();
    users.getUser();
}

main();