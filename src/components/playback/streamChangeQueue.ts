type Task = { run: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void };
type Queue = { pending?: Task };
const queues = new WeakMap<object, Queue>();

async function drain(target: object, queue: Queue, task: Task) {
    let current: Task | undefined = task;
    while (current) {
        try {
            await current.run();
            current.resolve();
        } catch (error) {
            current.reject(error);
        }
        current = queue.pending;
        queue.pending = undefined;
    }
    if (queues.get(target) === queue) queues.delete(target);
}

export function cancelStreamChanges(target: object) {
    const queue = queues.get(target);
    if (queue) {
        queue.pending?.resolve();
        queue.pending = undefined;
        queues.delete(target);
    }
}

/** A media element can load one replacement at a time; pending choices use the latest. */
export function queueStreamChange(target: object, run: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
        const task = { run, resolve, reject };
        const queue = queues.get(target);
        if (queue) {
            queue.pending?.resolve();
            queue.pending = task;
        } else {
            const next: Queue = {};
            queues.set(target, next);
            void drain(target, next, task);
        }
    });
}
