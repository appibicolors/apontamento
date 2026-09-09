import assert from "node:assert/strict";
import test from "node:test";
import {factoryDateTimeInput,factoryInputToIso,formatFactoryDateTime} from "../app/factory-time.ts";

test("always displays timestamps in the factory time zone",()=>{
  assert.equal(formatFactoryDateTime("2026-09-09T18:06:35.000Z"),"09/09/2026, 15:06:35");
  assert.equal(factoryDateTimeInput("2026-09-09T18:06:35.000Z"),"2026-09-09T15:06");
});

test("converts an admin-entered factory time back to the correct instant",()=>{
  assert.equal(factoryInputToIso("2026-09-09T15:06"),"2026-09-09T18:06:00.000Z");
});
