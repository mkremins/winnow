# Winnow
Winnow is a declarative domain-specific query language for _story sifting_, or identifying narratively compelling sequences of events in a larger corpus of narrative material. For instance, Winnow can be used to search for compelling emergent microstories within the output of a simulation-driven game, such as _Dwarf Fortress_ or _The Sims_.

## Example
A typical Winnow sifting pattern looks something like this:

```clj
(pattern violationOfHospitality
  (event ?e1 where
    eventType: enterTown,
    actor: ?guest)
  (event ?e2 where
    eventType: showHospitality,
    actor: ?host,
    target: ?guest,
    ?host.value: communalism)
  (event ?e3 where
    tag: harm,
    actor: ?host,
    target: ?guest)
  ;; make sure the guest hasn't left town
  (unless-event ?eMid between ?e1 ?e3 where
    eventType: leaveTown,
    actor: ?guest))
```

This sifting pattern can be used to find instances of a _violation of hospitality_ microstory, in which a `?guest` character enters a town; is shown hospitality by a `?host` character who values communalism; but then is somehow harmed by the `?host` character before the `?guest` has a chance to leave town again.

More examples of Winnow sifting patterns can be found on the [tests page](https://mkremins.github.io/winnow/tests.html).

## Use cases
Winnow sifting patterns can be automatically translated into lower-level [Felt](https://github.com/mkremins/felt) sifting patterns, allowing you to use Winnow as a more human-friendly syntax for the specification of Felt patterns. However, Winnow also provides unique affordances for _incremental_ story sifting (sifting while the simulation is still live) and _partial_ story sifting (identifying the beginnings of compelling event sequences that haven't yet been completed.)
