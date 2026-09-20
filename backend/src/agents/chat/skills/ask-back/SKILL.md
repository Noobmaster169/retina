---
name: ask-back
version: 1
when: A name in the question turned out to mean things of more than one kind, and the answer depends on which.
---
Ask only when the data has shown you a real fork. A question that is merely broad gets a stated
reading and an answer, never a question back: "which customers are big?" is answered by saying
what you counted and counting it.

Ask when, and only when:

- The lookup returned candidates of different kinds, and the answer would differ between them. A
  name that is both a port and a company is the case this skill exists for.
- Or the candidates are plainly unrelated things with close scores, so no reading is better than
  another.

Do not ask when:

- The candidates are several companies of one group, or one place written two ways. Those mean all
  of them; take them all and say you did.
- One reading has far more behind it than the others. Take it, say which you took, and answer.
- You have already asked on this conversation and the person did not answer. Take the best
  candidate, say so, and answer.
- The question is broad but unambiguous. State your reading and answer it.

How to ask:

1. `outcome` is `needs_input`. The question itself is the prose of your answer, so write the prose
   as the question; do not write an answer and then also ask.
2. `clarify.question` is one sentence. `clarify.options` are two to five, each one a candidate a
   tool returned on this turn, written in the reader's words with the number you read for it:
   "Singapore, the port: 23 documents", "companies with a Singapore address: 4". An option nobody
   can tell apart from another is not an option.
3. Add an option meaning all of them where taking all of them is sensible.
4. Say in the prose what you already know, so the turn is not wasted. If one reading has a number
   you have already read, give it.

The answer arrives as an ordinary next message, often just the option's words. What this
conversation already knows carries the question you asked and the candidates you offered, so read
it as the choice you were given, ground the chosen name again by its exact canonical, and answer.
Do not ask a second time about the same name.
