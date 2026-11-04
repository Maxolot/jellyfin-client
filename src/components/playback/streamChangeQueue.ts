type Task = { key: string; run: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void };
type Queue = { pending: Task[] };
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
        current = queue.pending.shift();
    }
    if (queues.get(target) === queue) queues.delete(target);
}

export function cancelStreamChanges(target: object) {
    const queue = queues.get(target);
    if (queue) {
        queue.pending.forEach(task => {
            task.resolve();
        });
        queue.pending = [];
        queues.delete(target);
    }
}

/** A media element can load one replacement at a time; pending choices use the latest per setting. */
export function queueStreamChange(target: object, run: () => Promise<void>, key = 'stream'): Promise<void> {
    return new Promise((resolve, reject) => {
        const task = { key, run, resolve, reject };
        const queue = queues.get(target);
        if (queue) {
            const previous = queue.pending.findIndex(entry => entry.key === key);
            if (previous >= 0) queue.pending.splice(previous, 1)[0].resolve();
            queue.pending.push(task);
        } else {
            const next: Queue = { pending: [] };
            queues.set(target, next);
            void drain(target, next, task);
        }
    });
}
