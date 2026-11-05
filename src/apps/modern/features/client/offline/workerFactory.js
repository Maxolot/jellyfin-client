// worker-loader supplies the constructor; the worker module itself exports no browser value.
import OpfsWorker from './opfs.worker.ts';

export default function createFileWorker() {
    // eslint-disable-next-line sonarjs/new-operator-misuse -- worker-loader replaces the module with a constructor.
    return new OpfsWorker();
}
