const DEBUG = true;

export default (...args) => {
    if (DEBUG) {
        console.log(...args); // eslint-disable-line
    }
};
