-- name: cost_by_step
-- version: 1
-- about: Model calls of one run by step and model: how many, how many failed, what they cost and how long they took.
-- params: run_id uuid
-- returns: step, model, model_calls, failed, cost_usd, avg_latency_ms
select l.step, l.model, count(*) as model_calls,
       count(*) filter (where not l.ok) as failed,
       round(coalesce(sum(l.cost_usd), 0), 4) as cost_usd,
       round(avg(l.latency_ms)) as avg_latency_ms
  from core.llm_calls l
 where l.run_id = $1::uuid
 group by l.step, l.model
 order by count(*) desc
