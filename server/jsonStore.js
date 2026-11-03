// The small JSON files the Pi keeps (the ideas box, the Model Workshop, the Hero Builder,
// the friends log, the saved games): read with a fallback, written whole and safely, and
// the JSON answers the screens get.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readBody } from './readBody.js'

// The file's contents, or `fallback` when it isn't there or can't be read (said in the log,
// as `what`, so a broken file doesn't stop the Pi).
export function readJsonFile(file, fallback, what = file) {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`Could not read ${what}:`, error.message)
    return fallback
  }
}

// Writes the whole file next to it first, then swaps it in, so a power cut mid-write leaves
// the old file rather than half a file. Throws when the Pi can't write (a file error with a
// `code`, like EACCES).
export function writeJsonFile(file, data, space = 1) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(data, null, space))
  renameSync(temp, file)
}

export const sendJson = (res, status, body) =>
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))

// A request's JSON body, up to `limit` bytes; an empty body is {}.
export async function readJsonBody(req, limit = 16 * 1024) {
  return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}')
}
