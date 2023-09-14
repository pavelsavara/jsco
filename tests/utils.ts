import { writeFileSync } from 'node:fs';

export function writeToFile(name: string, content: string) {
    writeFileSync(`./tests/${name}`, content);
}