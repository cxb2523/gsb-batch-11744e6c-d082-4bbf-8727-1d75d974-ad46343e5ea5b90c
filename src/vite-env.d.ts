declare module '*.less' {
    const classes: { [key: string]: string };
    export default classes;
}

declare module '*.css';
declare module '*.scss';

declare module 'virtual:svg-icons-register';
