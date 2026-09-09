import assert from "node:assert/strict";
import test from "node:test";
import {addCalendarDays,deadlineStatus,matchesDeadlineFilter} from "../app/deadline.ts";

test("calculates the estimated delivery using calendar days",()=>{
  assert.equal(addCalendarDays("2026-09-09",7),"2026-09-16");
  assert.equal(addCalendarDays("2026-12-29",7),"2027-01-05");
});

test("classifies only open orders by deadline",()=>{
  assert.equal(deadlineStatus({data_op:"2026-09-01",prazo_dias:7},"2026-09-09").key,"overdue");
  assert.equal(deadlineStatus({data_op:"2026-09-09",prazo_dias:3},"2026-09-09").key,"near");
  assert.equal(deadlineStatus({data_op:"2026-09-09",prazo_dias:null},"2026-09-09").key,"no_deadline");
  assert.equal(deadlineStatus({data_op:"2026-09-01",prazo_dias:7,encerrada_em:"2026-09-08T18:00:00Z"},"2026-09-09").key,"closed");
});

test("supports operational deadline filters",()=>{
  const order={data_op:"2026-09-09",prazo_dias:5};
  assert.equal(matchesDeadlineFilter(order,"next7","2026-09-09"),true);
  assert.equal(matchesDeadlineFilter(order,"next3","2026-09-09"),false);
  assert.equal(matchesDeadlineFilter(order,"on_time","2026-09-09"),true);
});
