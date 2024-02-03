import {describe, expect, test} from "vitest";
import {acquireLock, isLockActive, waitForLockRelease, withLock} from "../src/index.js";

describe("withLock", () => {
    test("lock works", async () => {
        const scope1 = {};
        const key1 = "key";

        let proceedLock1: ((value: "something") => void) | null = null;
        let lock1Done = false;
        const lockPromise1 = withLock(scope1, key1, async () => {
            const res = await new Promise((accept) => {
                proceedLock1 = accept;
            });
            lock1Done = true;
            return res;
        });

        let proceedLock2: ((value: "something2") => void) | null = null;
        let lock2Done = false;
        const lockPromise2 = withLock(scope1, key1, async () => {
            const res = await new Promise((accept) => {
                proceedLock2 = accept;
            });
            lock2Done = true;
            return res;
        });

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive(scope1, key1)).toBe(true);

        proceedLock1!("something");
        await expect(lockPromise1).resolves.toBe("something");
        expect(isLockActive(scope1, key1)).toBe(true);
        await new Promise((accept) => setTimeout(accept, 0));
        expect(isLockActive(scope1, key1)).toBe(true);

        expect(proceedLock2).not.toBeNull();
        expect(lock2Done).toBe(false);

        proceedLock2!("something2");
        await expect(lockPromise2).resolves.toBe("something2");
        expect(isLockActive(scope1, key1)).toBe(false);
        await new Promise((accept) => setTimeout(accept, 0));
        expect(lock2Done).toBe(true);

        expect(isLockActive(scope1, key1)).toBe(false);
    });

    test("acquireLock", async () => {
        const scope1 = {};
        const key1 = "key";

        const lock1 = await acquireLock(scope1, key1);
        expect(isLockActive(scope1, key1)).toBe(true);

        let acquiredLock2 = false;
        const lock2Promise = (async () => {
            const res = await acquireLock(scope1, key1);
            acquiredLock2 = true;
            return res;
        })();

        expect(acquiredLock2).toBe(false);

        await new Promise((accept) => setTimeout(accept, 0));
        expect(acquiredLock2).toBe(false);

        lock1.dispose();
        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive(scope1, key1)).toBe(true);
        expect(acquiredLock2).toBe(true);

        const lock2 = await lock2Promise;
        lock2[Symbol.dispose]();
        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive(scope1, key1)).toBe(false);
    });

    test("call order", async () => {
        const scope1 = {};
        const key1 = "key";

        const res: number[] = [];

        async function addRow(index: number) {
            await withLock(scope1, key1, async () => {
                await new Promise(resolve => setTimeout(resolve, 1));
                res.push(index);
            });
        }

        await Promise.all([
            addRow(1),
            addRow(2),
            addRow(3)
        ]);

        expect(res).toEqual([1, 2, 3]);
    });

    test("waitForLockRelease", async () => {
        const scope1 = {};
        const key1 = "key";

        const waitForEnoughMicrotasks = async () => {
            for (let i = 0; i < 10; i++)
                await Promise.resolve();
        };

        const lock1 = await acquireLock(scope1, key1);

        const lockWithError2 = withLock(scope1, key1, async () => {
            throw new Error("some error");
        });

        let lockReleased = false;
        void (async () => {
            await waitForLockRelease(scope1, key1);
            lockReleased = true;
        })();

        const lock3Promise = acquireLock(scope1, key1);

        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        lock1.dispose();
        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        try {
            await lockWithError2;
            expect.unreachable("lockWithError2 should throw");
        } catch (err) {
            expect(lockReleased).toBe(false);
            await waitForEnoughMicrotasks();
            expect(lockReleased).toBe(false);
        }

        const lock2 = await lock3Promise;
        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        lock2.dispose();

        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(true);
    });
});
