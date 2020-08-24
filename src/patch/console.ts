export default function patchConsole(debug: boolean) {
  const console = global.console;
  const levels = ['trace', 'log', 'info', 'debug', 'warn', 'error'];

  levels.forEach(level => {
    console[level] = (write => {
      return debug
        ? function LOG() {
            write.call(console, ...arguments);
          }
        : function noop() {};
    })(console[level]);
  });
}
