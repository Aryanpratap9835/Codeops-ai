export class UserService {
    id: number = 1;
    getUser() {
        return this.id;
    }
    deleteUser() { }
}
export function createUser() { }
export const calculate = (a: number, b: number) => {
    return a + b;
};
function internalFunction() { }