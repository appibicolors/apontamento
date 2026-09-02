import assert from "node:assert/strict";import test from "node:test";import {formatDuration} from "../app/duration.ts";
test("calcula duração finalizada e em andamento",()=>{assert.equal(formatDuration("2026-09-02T10:00:00Z","2026-09-02T12:05:09Z"),"02:05:09");assert.equal(formatDuration("2026-09-02T10:00:00Z",null,new Date("2026-09-02T10:01:30Z").getTime()),"00:01:30")});
