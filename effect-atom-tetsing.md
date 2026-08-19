# Testing React Components That Use Effect Atom

**A hands-on course on testing React components that manage server state with Effect Atom, using Vitest Browser Mode and Effect v4.**

---

## Course structure

Chapters marked **(parent)** are grouping chapters only. They have no page of their own. Every other chapter is a standalone page.

1. Introduction
2. Project overview
3. Project setup
4. Vitest Browser Mode **(parent)**
   - 4.1 What Browser Mode is and why we use it
   - 4.2 How it differs from React Testing Library
   - 4.3 The concepts you must know: locators, retrying assertions, interactions
5. Effect Atom testing essentials **(parent)**
   - 5.1 The registry is the world
   - 5.2 AsyncResult: the state you assert on
   - 5.3 The three seams: how a test takes control
   - 5.4 Do we need the Effect vitest package?
6. Testing the components **(parent)**
   - 6.1 UserGrid: rendering every AsyncResult state
   - 6.2 UserPagination: shared writable atoms
   - 6.3 UserSearchBar: atoms that live in the URL
   - 6.4 UserDetail: seeding runtime atoms
   - 6.5 UserDeleteDialog: swapping the service layer
   - 6.6 UserLoadMore: pull atoms and streams
   - 6.7 HydrationBoundary: testing server state transfer
7. Best practices and gotchas
8. Appendix: what changed in the latest Effect v4 beta
9. Conclusion

---

# 1. Introduction

Server state is the data your React application fetches from somewhere else: a list of users from an API, a person's profile, a page of search results. Libraries like Effect Atom manage that data for you. They track whether it is still loading, whether it arrived, or whether the request failed, and they keep every component that reads the data in sync.

This course teaches you how to test React components that use Effect Atom for server state. By the end, you will be able to answer, with working code, questions like:

- How do I render a component in a specific loading, success, or error state, without a real server?
- How do I replace the service that talks to the network with a fake one, for exactly one test?
- How do I test a delete button that updates the UI optimistically and shows a toast?
- How do I test pagination that loads more results from a stream?
- How do I test the hand-off of data from server rendering to the browser?

Two decisions shape everything in this course.

**First, we test in a real browser.** Our tests run with Vitest Browser Mode, which executes each test inside an actual Chromium browser. Your component renders into a real page, clicks are real clicks, and the address bar is a real address bar. Chapter 4 explains what this means and how it compares to the tools you may already know.

**Second, we never monkey patch.** You will not see `vi.mock` in this course. Effect Atom gives us honest, typed ways to put a component into any state we want: we can hand it an atom that already holds the state, we can seed values into the registry before rendering, and we can swap the entire data service for a fake one. Chapter 5 builds up these three techniques, and chapter 6 applies them to seven real components.

## What you need to know already

You should be comfortable with React and TypeScript, and you should have followed the main Effect Atom course (or be familiar with its ideas): atoms, the registry, `useAtomValue` and `useAtomSet`, runtime atoms backed by services, and `AsyncResult`. You do not need any testing experience. Every testing term is explained when it first appears.

We use Effect v4, which is currently in beta, pinned to an exact version. The demo repository is already pinned correctly and chapter 8 documents everything that changed when we moved it to the latest beta.

## How the course works

You will clone a small user directory application and write every test yourself. Each chapter in part 6 follows the same rhythm: we pick one component, we work out which test cases are worth writing and why, we write the tests, and then we walk through the parts of the code that matter. Every test in this course has been run and passes.

---

# 2. Project overview

Before testing anything, you need a clear map of what you are testing. This chapter walks through the demo application and points out, ahead of time, the places our tests will grab onto.

## The application

The app is a user directory built with Next.js and Effect Atom. It has three pages:

- A home page that lists users in a grid, with a search bar, pagination, and a "show more" button.
- A user detail page that shows one person's information, loading the basic info and the address separately.
- A form page for adding a new user.

Users can also be deleted through a confirmation dialog, and deletions update the list optimistically, meaning the UI removes the user immediately and only rolls back if the server reports a failure.

## The layers of the app

The code is organized in three layers. Understanding them tells you where tests will intervene.

### The service

`services/user-service.ts` defines `UserService`, a class that knows how to talk to the API over HTTP. It exposes methods like `getUsers`, `getUser`, `deleteUser`, `addUser`, and `getUsersStream`, which returns results page by page. Every method returns an Effect (a description of an asynchronous computation) or a Stream (a sequence of values arriving over time). Failures are typed: a request can fail with `ClientError`, `ServerError`, or `ParseError`, and these appear in the method signatures.

The service is registered under a key, and the rest of the app asks for it by that key instead of importing a concrete implementation. This single fact is what will later let a test slide a fake service into place without touching any component code.

### The atoms

`atoms/user.ts`, `atoms/search.ts`, and `atoms/page.ts` define the application state:

- `atomRuntime` is created from `UserService.layer`. A runtime atom created through it can run Effects that use the service.
- `usersAtom(query, page)` fetches one page of users. It is a family, meaning a function that returns one atom per distinct key.
- `currentUsersAtom` is a derived atom: it reads the current search query and page atoms and returns the matching `usersAtom` result.
- `userBasicAtom(id)` and `userAddressAtom(id)` fetch the two halves of the detail page separately.
- `usersLoadMoreAtom` is a pull atom built on the service's stream: each call pulls one more page.
- `deleteUserAtom` and `addUserAtom` are function atoms: atoms you call like functions to run a mutation.
- `optimisticDeleteUserAtom` wraps the delete in an optimistic update over the loaded list.
- `searchQueryAtom` and `pageAtom` are writable atoms whose storage is the browser URL itself. The query lives in `?q=` and the page in `?page=`.

### The components

Components read atoms with hooks and render based on the state they find. Two design choices in this codebase matter enormously for testing, so let us name them now:

**Choice one: components receive atoms as props.** Look at the grid:

```tsx
interface UserGridProps {
  usersStateAtom: typeof currentUsersAtom;
}

export function UserGrid({ usersStateAtom }: UserGridProps) {
  const usersResult = useAtomValue(usersStateAtom, selectUsers);
  ...
}
```

`UserGrid` does not import `currentUsersAtom` and read it directly. It accepts an atom of the same type as a prop. In production, `HomePageClient` passes the real atom. In a test, we can pass a simple atom that already holds whatever state we want the component to render. You will use this constantly.

**Choice two: every piece of asynchronous state is an `AsyncResult`.** An `AsyncResult` is a value with three possible shapes: `Initial` (no data yet), `Success` (here is the value), and `Failure` (here is what went wrong). Components branch on these shapes. The grid uses the builder, a chained style where you handle each shape and the type system tracks which ones you have covered:

```tsx
return AsyncResult.builder(usersResult)
  .onInitial(() => <UserGridSpinner />)
  .onErrorTag("ClientError", (error) => (
    <FailureCard title="Client Error" message={error.message} />
  ))
  .onErrorTag("ServerError", (error) => (
    <FailureCard title="Server Error" message={error.message} />
  ))
  .onErrorTag("ParseError", (error) => (
    <FailureCard title="Parse Error" message={error.message} />
  ))
  .onErrorTag("ConfigError", () => (
    <FailureCard
      title="Configuration Error"
      message="The application is misconfigured. Please try again later."
    />
  ))
  .onDefect(() => (
    <FailureCard
      title="Unexpected Error"
      message="Something went wrong. Please try refreshing the page."
    />
  ))
  .onInterrupt(() => null)
  .onSuccess((users) => ...)
  .exhaustive();
```

Note the final call: `.exhaustive()`. This method only becomes available, at the type level, once every possible case has been handled. If someone later adds a new error to the service and forgets to render it, the component stops compiling. For us as testers this is a gift: the component's branches are enumerated right there in the code, and each branch is a test case candidate.

You may wonder about two of those branches. A defect is a failure that was not part of the plan: not a typed error the service declared, but something like a thrown exception or a bug. An interrupt happens when the running Effect is cancelled, for example because the component unmounted. The builder forces you to decide what both should look like.

## Server rendering and hydration

The home page and the detail page are rendered on the server first. The server creates its own registry (the container that holds atom state), fetches data into it, and then serializes that state and sends it along with the HTML. In the browser, a component called `HydrationBoundary` reads that serialized state and loads it into the browser's registry, so components render instantly with server data instead of fetching again. Serializing registry state is called dehydration, and loading it back in is called hydration.

In this codebase the `HydrationBoundary` is written by hand, from scratch, in `components/hydration-boundary.tsx`, so you can see exactly how hydration works. We will test it in chapter 6.7.

## What we will grab onto

To summarize the map, our tests will use three entry points, developed fully in chapter 5:

1. Components that take atoms as props can be handed a pre-made atom (the grid, the pagination).
2. Atoms that live in the registry can be seeded with initial values before the component renders (the detail page).
3. The runtime's service layer can be replaced with a fake implementation (the delete dialog, the load more button).

---

# 3. Project setup

## Step 1: clone the repository

```bash
git clone -b completed-paid https://github.com/sundaray/effect-atom-start.git
cd effect-atom-start
npm install
```

The repository already contains the finished application and the test files you will build through this course. If you want to write everything yourself, delete the files ending in `.test.tsx` inside `components/` after cloning, and recreate them chapter by chapter.

## Step 2: install the browser

Our tests run inside a real Chromium browser. Playwright, one of the packages installed above, manages browser binaries for us, but the binary itself is a separate download:

```bash
npx playwright install chromium
```

This downloads a browser build once and caches it on your machine.

## Step 3: understand the packages

Open `package.json` and look at the testing-related entries. Here is what each one does.

**`effect` and `@effect/atom-react` (pinned to the same exact beta version).** The core library and its React bindings. Effect v4 ships all of its packages in lockstep: the two versions must always match exactly, down to the beta number. If they ever drift apart you will see confusing type errors deep inside the library. When you upgrade one, upgrade both.

**`vitest`.** The test runner: the program that finds files ending in `.test.tsx`, runs them, and reports which passed. Vitest also gives us `describe` (a way to group related tests), `it` (a single test), and `expect` (the assertion function used to state what should be true).

**`@vitest/browser-playwright`.** The bridge between Vitest and a real browser. Vitest normally runs tests in Node.js, a JavaScript environment without a screen, without real user input, and without a real address bar. This package is a provider: it teaches Vitest how to start a browser through Playwright, load your test files into a page, and report results back.

**`playwright`.** The browser automation library that the provider uses under the hood to launch and control Chromium.

**`vitest-browser-react`.** Render support for React in Browser Mode. It gives us the `render` function that mounts a React component into the test page, and cleans it up automatically after each test.

**`@vitejs/plugin-react`.** Vitest builds your files with Vite, a build tool. This plugin teaches Vite how to compile React's JSX syntax. Without it, the test files would not compile, because the project's TypeScript configuration leaves JSX handling to the framework.

## Step 4: read the test configuration

The configuration lives in `vitest.config.ts`:

```ts
import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["components/**/*.test.tsx"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
```

Reading it top to bottom: test files are the `.test.tsx` files that sit next to the components they test; Browser Mode is switched on; Playwright provides the browser; and we run one browser instance, Chromium. The `alias` entry makes the `@/` import prefix work in tests exactly as it does in the app.

One version note: this configuration style, where the provider is an imported function, is the current API for Vitest 4. Older tutorials show a string like `provider: "playwright"` together with a package named `@vitest/browser`. That older API no longer exists in Vitest 4, so trust this shape, not the older posts.

## Step 5: run the tests

```bash
npm test          # run everything once
npm run test:watch  # keep running while you edit
```

The first run opens Chromium invisibly (this is called headless mode), runs every test inside it, and prints the results in your terminal. If everything is green, your setup is complete.

---

# 4. Vitest Browser Mode _(parent chapter, no page)_

_Three short pages that give you the mental model for the tool we test with. If you have only ever tested React with jsdom and React Testing Library, read all three: the differences are bigger than they look._

---

## 4.1 What Browser Mode is and why we use it

For years, the standard way to test React components looked like this: run the tests in Node.js, and install a package called jsdom that imitates a browser. jsdom implements enough of the document object model (the tree of elements a page is made of) that React can render into it, and tests can then look elements up and simulate events on them.

The key word is _imitates_. jsdom is a simulation of a browser written in JavaScript, and the simulation has holes. There is no real layout engine, so nothing truly has a size or a position. There is no real navigation. Styles do not cascade the way they do in a browser. Events are synthetic dispatches rather than a real input pipeline. For many components this never matters. For some it matters enormously, and the failure mode is unpleasant in both directions: tests that pass while the real UI is broken, and tests that fail on things a real browser would do fine.

Vitest Browser Mode removes the simulation. Your test file itself is loaded into a real browser page, and everything runs there:

- `render` mounts your component into a real document.
- A click is performed through the browser automation layer, with the same event sequence a person's click produces.
- `window.location` is a real address bar (of the test page), and history updates really happen.
- What is visible, focusable, or disabled is decided by a real rendering engine.

This matters for our course specifically because Effect Atom's URL-backed atoms (`searchQueryAtom`, `pageAtom`) read and write `window.location`. Testing them against a real address bar means the test proves the real behavior, not a simulation of it.

The cost is honesty about speed and setup: a browser must start (a second or two once, at the beginning of the run), and a browser binary must be installed. In exchange, the thing under test is the thing your users run.

## 4.2 How it differs from React Testing Library

React Testing Library, usually shortened to RTL, is the library most React developers have used for component tests. It popularized an excellent idea: find elements the way a user would, by their role, their text, or their label, instead of by implementation details like CSS class names. That idea carries over fully into Browser Mode. What changes is the machinery around it.

**Where tests run.** RTL runs in Node.js with jsdom. Browser Mode runs in Chromium (or Firefox, or WebKit). Everything in section 4.1 follows from this.

**How you find elements.** RTL queries return actual element objects immediately: `screen.getByText("Save")` either returns an element right now or throws right now. Browser Mode queries return locators. A locator is a description of how to find an element, not the element itself. Nothing is looked up when you create one:

```tsx
const button = screen.getByRole("button", { name: /show more/i });
```

This line succeeds even if the button does not exist yet. The lookup happens when the locator is used, and this is the foundation of the next difference.

**How waiting works.** Asynchronous UI is the whole business of this course: components start in a loading state and settle later. With RTL you handle this with explicit waiting tools (`waitFor`, `findBy` queries) and it is easy to forget one and write a test that fails intermittently. In Browser Mode, waiting is built into assertions themselves:

```tsx
await expect.element(screen.getByText("Jane Doe")).toBeInTheDocument();
```

`expect.element` retries: it keeps evaluating the locator and the condition until both hold or a timeout passes. You state the destination, and the framework absorbs the timing. Most of the tests you will write in this course are just sequences of interactions and retrying assertions, with no explicit sleeps or waits anywhere.

**How you interact.** RTL pairs with a package called user-event that simulates input in jsdom. In Browser Mode, interactions go through the browser automation layer. Locators have action methods (`await button.click()`, `await input.fill("jane")`), and a `userEvent` object from `vitest/browser` covers typing and keyboard work. These produce real browser events: real focus movement, real key down and key up sequences.

**What stays the same.** The philosophy. You still find things by role and text, you still assert on what the user can see, and you still avoid reaching into component internals. If you have written good RTL tests, your instincts transfer; mostly your imports change and your assertions gain `await`.

## 4.3 The concepts you must know: locators, retrying assertions, interactions

This page collects the small set of Browser Mode concepts the rest of the course uses on every page. Come back here whenever a test in chapter 6 uses something unfamiliar.

**Rendering.** `render` comes from `vitest-browser-react` and is asynchronous:

```tsx
const screen = await render(<UserGrid usersStateAtom={atom} />);
```

The returned object, conventionally named `screen`, is your handle on the rendered output. Cleanup is automatic between tests.

**Locators.** You create locators from `screen`:

```tsx
screen.getByRole("button", { name: /next/i }); // an accessible role plus its name
screen.getByText("Server Error"); // exact or matching text
screen.getByRole("searchbox"); // form controls by their role
```

Prefer `getByRole` when the element has a meaningful role. Roles come from the accessibility system: a button has the role button, a search input has the role searchbox, a dialog has the role dialog. Tests written this way survive redesigns and double as a check that your page is accessible.

Locators can be chained to search within a region:

```tsx
const dialog = screen.getByRole("dialog");
await expect.element(dialog.getByText("Delete Jane Doe?")).toBeInTheDocument();
```

**Retrying assertions.** The two assertion forms you will use are:

```tsx
await expect.element(locator).toBeInTheDocument(); // element-based, retries
await expect.poll(() => someValue()).toBe("jane"); // value-based, retries
```

`expect.element` accepts the same matchers you may know from jest-dom, such as `toBeInTheDocument`, `toHaveValue`, `toBeDisabled`, and `toBeVisible`, and it retries until the matcher passes. `expect.poll` retries an arbitrary function, which we use for things that are not elements, like the current URL query string. Both must be awaited. Forgetting `await` on these is the single most common beginner mistake in Browser Mode; the assertion silently floats away and the test may end before it runs.

Negative assertions work too, and they also retry:

```tsx
await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
```

**Interactions.** Actions live on locators and are awaited:

```tsx
await screen.getByRole("button", { name: /next/i }).click();
await userEvent.type(screen.getByRole("searchbox"), "jane");
```

`userEvent` is imported from `vitest/browser` and covers typing, keyboard shortcuts, and other composite input.

**Escaping to the document.** Occasionally there is no good role or text to target, for example a purely decorative loading spinner. `screen.container` is the real DOM element your component rendered into, and you may query it directly:

```tsx
expect(screen.container.querySelector(".animate-spin")).not.toBeNull();
```

Use this sparingly; it couples the test to markup details. We permit ourselves this one for spinners because a spinner has no accessible identity to target.

---

# 5. Effect Atom testing essentials _(parent chapter, no page)_

_Everything in chapter 6 stands on four ideas. Two are about Effect Atom's architecture, one is a catalogue of the techniques we will use to take control of state, and one settles a package question._

---

## 5.1 The registry is the world

Every atom value in an Effect Atom application lives in a registry. The registry is a container that holds the current value of each atom, tracks which components subscribe to which atoms, and re-runs derived and runtime atoms when their inputs change. Components find the registry through React context, provided by `RegistryProvider`.

An atom on its own is only a description. `Atom.make(0)` does not hold a zero anywhere; it describes a piece of state whose initial value is zero. Only when a registry reads that atom does a value exist, inside that registry. Two registries holding the same atom are two independent worlds.

This is the single most useful fact for testing. **If every test renders inside its own `RegistryProvider`, every test gets its own world.** Nothing an atom did in one test can leak into the next: no cached data, no leftover URL sync, no half-finished fetches. Our tests therefore all share this skeleton:

```tsx
const screen = await render(
  <RegistryProvider>
    <ComponentUnderTest ... />
  </RegistryProvider>,
);
```

No cleanup code, no state reset between tests, ever. Isolation comes from construction, not from discipline.

`RegistryProvider` also accepts options, and one of them, `initialValues`, is a testing superpower we will meet in 5.3.

## 5.2 AsyncResult: the state you assert on

Components that show server data are, at heart, functions from an `AsyncResult` to pixels. Testing them means putting a specific `AsyncResult` in front of them and asserting on the pixels. So you need to be fluent in constructing `AsyncResult` values by hand.

The three shapes, and how to build them in a test:

```tsx
import { AsyncResult } from "effect/unstable/reactivity";
import { Cause } from "effect";

// 1. Initial: nothing has arrived yet. Pass true to mark it as
// actively waiting, which is how a freshly started fetch looks.
AsyncResult.initial<UsersResponse, HttpError>(true)

// 2. Success: the data is here.
AsyncResult.success<UsersResponse, HttpError>({ users: [...], usersCount: 2 })

// 3. Failure with a typed error: something the service declared can happen.
AsyncResult.fail<HttpError, UsersResponse>(
  new ClientError({ message: "Network is down", cause: null }),
)

// 4. Failure with a defect: something nobody declared, like a bug.
AsyncResult.failure<UsersResponse, HttpError>(Cause.die(new Error("boom")))
```

Two of these deserve a closer look.

The difference between `fail` and `failure` mirrors the difference between the two kinds of failure you met in the builder in chapter 2. `AsyncResult.fail(error)` wraps a typed, declared error. `AsyncResult.failure(cause)` takes a `Cause`, a richer structure that can also represent defects (unplanned failures, built with `Cause.die`) and interruptions. When you want to test the component's "Unexpected Error" branch, you need a defect, so you reach for `failure` plus `Cause.die`.

Also note the type parameters. `AsyncResult<A, E>` carries the success type and the error type, and the constructors need to know both so the resulting value is assignable to what the component expects. When the compiler complains about a hand-built result, the fix is almost always spelling out both type parameters, as in the examples above.

There is one more field worth knowing: every `AsyncResult`, whatever its shape, has a boolean `waiting` flag. A `Success` with `waiting: true` means "here is the previous data, and a refresh is in flight". Components use it to show stale data with a spinner on top. You can construct it in tests with the options argument: `AsyncResult.success(value, { waiting: true })`.

## 5.3 The three seams: how a test takes control

A seam is a place where you can change a program's behavior without editing its code. Testing UI that depends on server state is entirely a question of finding good seams. Effect Atom gives us three, in increasing order of depth. Chapter 6 is organized around them.

**Seam one: pass the atom in.** Components in this codebase accept their atoms as props. So the shallowest seam is to construct a plain atom that already holds the state you want, and hand it over:

```tsx
const usersStateAtom: typeof currentUsersAtom = Atom.make(
  AsyncResult.success<UsersResponse, HttpError>({
    users: [jane],
    usersCount: 1,
  }),
);

await render(
  <RegistryProvider>
    <UserGrid usersStateAtom={usersStateAtom} />
  </RegistryProvider>,
);
```

`Atom.make(value)` creates a simple atom whose initial value is exactly `value`. The component cannot tell the difference between this and the real derived atom; both satisfy the same type. This seam is perfect for pure rendering components: no network, no service, no asynchrony at all.

**Seam two: seed the registry.** Some components do not take atoms as props; they call an atom family directly, like the detail page calling `userBasicAtom(id)`. For these, `RegistryProvider` accepts `initialValues`, a list of atom-to-value pairs applied before anything renders:

```tsx
<RegistryProvider
  initialValues={[
    Atom.initialValue(userBasicAtom("1"), AsyncResult.success(janeBasic)),
    Atom.initialValue(userAddressAtom("1"), AsyncResult.initial(true)),
  ]}
>
  <UserDetail id="1" />
</RegistryProvider>
```

`Atom.initialValue(atom, value)` builds one such pair. When the component reads `userBasicAtom("1")`, the registry already has a value for it, so the runtime atom never runs its Effect and never touches the network. This is, not by coincidence, the same mechanism server rendering uses to hand data to the browser: seeding a registry with known values.

**Seam three: swap the service layer.** The deepest seam replaces the implementation behind the atoms while leaving every atom and component untouched. Recall that `atomRuntime` was built from `UserService.layer`. The runtime exposes that layer as an atom itself: `atomRuntime.layer`. And since it is an atom, it can be seeded like any other:

```tsx
const testLayer = Layer.succeed(UserService, {
  getUsers: () => Effect.die("not implemented"),
  getUsersStream: () => Stream.make({ users: [jane], hasMore: false }),
  getUser: () => Effect.die("not implemented"),
  getUserBasic: () => Effect.die("not implemented"),
  getUserAddress: () => Effect.die("not implemented"),
  addUser: () => Effect.die("not implemented"),
  deleteUser: () => Effect.void,
});

<RegistryProvider
  initialValues={[Atom.initialValue(atomRuntime.layer, testLayer)]}
>
```

`Layer.succeed(UserService, implementation)` builds a layer (a recipe for providing a service) whose `UserService` is the object we wrote by hand. Now every runtime atom in this registry, when it runs, finds our fake service instead of the HTTP one. The mutation atoms, the pull atom, everything, runs its real logic against our substitute.

Notice what kind of fake this is. It is not a patched module or an intercepted import. It is a complete, type-checked implementation of the real `UserService` interface. If the service gains a method next month, this object stops compiling until you decide what the fake should do. Fakes that the compiler keeps honest are usually called test doubles, and they are the reason this course never needs `vi.mock`.

A convention we follow: methods the test does not expect to be called are implemented as `Effect.die("not implemented")`. If a test accidentally exercises one, it fails loudly with that message instead of silently succeeding.

**Choosing a seam.** Use the shallowest seam that lets you control what you need. Rendering states: seam one. Atom families read directly by the component: seam two. Anything where the component triggers work (mutations, streams, refreshes): seam three, because the work must actually run, just against a fake service.

## 5.4 Do we need the Effect vitest package?

If you have looked around the Effect ecosystem, you may have seen `@effect/vitest` and wondered whether this course needs it. The short answer: no, and understanding why will sharpen your sense of what we're actually testing.

`@effect/vitest` is a bridge between the Effect world and the Vitest world, and it is worth being precise about what that means. Vitest, by itself, understands two kinds of test body: synchronous functions and functions returning a promise. Effects are neither. An Effect is a description of a computation; nothing runs until something executes it, and executing it properly involves machinery Vitest knows nothing about: a fiber (Effect's lightweight thread), a scope for cleaning up resources, a test clock for controlling time, and services provided through layers. `@effect/vitest` supplies an `it.effect` helper that accepts an Effect as the test body, executes it on that machinery, and translates the outcome (success, typed failure, defect) into a Vitest pass or fail with a readable report. That is the bridge: it lets a test _be_ an Effect.

Our tests do not need the bridge, because our test bodies are not Effects. Look at the shape of what we write: render a component, click a button, assert on the page. The subject under test is the UI. Effects certainly run during the test, but they run where they run in production, inside the atom runtime, behind the registry. The test observes their consequences on the screen. We construct Effect values as data to hand to seams (an `AsyncResult` here, a `Layer` there), and constructing values requires no runtime at all.

When would you reach for `@effect/vitest`? When the subject under test _is_ Effect code: a service's business logic, a data transformation pipeline, anything you would call directly rather than through a component. If you extracted `UserService`'s pagination math into a pure function of Effects and wanted to unit test it with simulated time, `it.effect` and its test clock would be exactly the right tool. That is a different course's subject. For component tests, plain `it` plus the three seams is the whole story.

---

# 6. Testing the components _(parent chapter, no page)_

_Seven components, chosen so that together they cover the widest possible surface of Effect Atom testing: rendering states, shared writable atoms, URL-backed atoms, seeded runtime atoms, swapped service layers, mutations with optimistic updates, pull atoms over streams, and hydration. Keep `npm run test:watch` running as you work through these._

---

## 6.1 UserGrid: rendering every AsyncResult state

### What we're testing

`UserGrid` is the component that renders the list of users, and it is the purest example of the pattern from 5.2: it receives an atom as a prop, reads it, and renders one branch of an `AsyncResult` builder. There is no interaction and no mutation. That makes it the right place to learn the first seam and to build the habit of testing every state a component can show.

### Deciding the test cases

With builder-based components, you do not have to invent test cases. The component enumerates them itself: one `.on` call, one visual state, one test. Reading the builder in `user-grid.tsx` gives us the list:

- `onInitial`: the loading spinner.
- `onSuccess` with users: the grid of cards.
- `onSuccess` with an empty list: the empty state (a branch inside `onSuccess`, so it needs its own test).
- `onErrorTag` for `ClientError` and `ServerError`: failure cards with the error message. `ParseError` and `ConfigError` render through the identical code path, so testing two tags is a judgment call that buys the pattern without repeating it four times; add the other two if your risk tolerance demands it.
- `onDefect`: the "Unexpected Error" card.
- `onInterrupt` renders null and is not worth a test: asserting that nothing renders when a fiber is cancelled tests the library more than the component.

Six tests. The rule this illustrates: **a component's test list is its state list, not its feature list.**

### The tests

Create `components/user-grid.test.tsx`:

```tsx
import { RegistryProvider } from "@effect/atom-react";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { UserGrid } from "@/components/user-grid";

import { ClientError, ServerError, type HttpError } from "@/errors";
import type { User, UsersResponse } from "@/schema/user-schema";
import { currentUsersAtom } from "@/atoms/user";

type UsersResult = Atom.Type<typeof currentUsersAtom>;

function makeUser(id: string, firstName: string, lastName: string): User {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    company: { name: "Acme Corp", title: "Engineer" },
    address: { address: "123 Main St", city: "Springfield", state: "IL" },
  };
}

function renderGrid(result: UsersResult) {
  // The component receives its atom as a prop, so the test can hand it a
  // plain atom holding exactly the AsyncResult state it wants to see.
  const usersStateAtom: typeof currentUsersAtom = Atom.make(result);
  return render(
    <RegistryProvider>
      <UserGrid usersStateAtom={usersStateAtom} />
    </RegistryProvider>,
  );
}

describe("UserGrid", () => {
  it("shows the loading spinner while the result is Initial", async () => {
    const screen = await renderGrid(
      AsyncResult.initial<UsersResponse, HttpError>(true),
    );
    expect(screen.container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders a card for every user on success", async () => {
    const screen = await renderGrid(
      AsyncResult.success<UsersResponse, HttpError>({
        users: [makeUser("1", "Jane", "Doe"), makeUser("2", "John", "Smith")],
        usersCount: 2,
      }),
    );
    await expect.element(screen.getByText("Jane Doe")).toBeInTheDocument();
    await expect.element(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("shows the empty state when the list has no users", async () => {
    const screen = await renderGrid(
      AsyncResult.success<UsersResponse, HttpError>({
        users: [],
        usersCount: 0,
      }),
    );
    await expect
      .element(screen.getByText("The users list is currently empty."))
      .toBeInTheDocument();
  });

  it("shows a failure card for a typed ClientError", async () => {
    const screen = await renderGrid(
      AsyncResult.fail<HttpError, UsersResponse>(
        new ClientError({ message: "Network is down", cause: null }),
      ),
    );
    await expect.element(screen.getByText("Client Error")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Network is down"))
      .toBeInTheDocument();
  });

  it("shows a failure card for a typed ServerError", async () => {
    const screen = await renderGrid(
      AsyncResult.fail<HttpError, UsersResponse>(
        new ServerError({ message: "Server returned status 500", cause: null }),
      ),
    );
    await expect.element(screen.getByText("Server Error")).toBeInTheDocument();
  });

  it("shows the unexpected error card for a defect", async () => {
    const screen = await renderGrid(
      AsyncResult.failure<UsersResponse, HttpError>(
        Cause.die(new Error("boom")),
      ),
    );
    await expect
      .element(screen.getByText("Unexpected Error"))
      .toBeInTheDocument();
  });
});
```

### The parts that matter

**The `renderGrid` helper.** Every test differs only in the `AsyncResult` it starts from, so the helper takes exactly that and hides the rest. When tests share a helper whose one parameter is the thing under variation, each test reads as a sentence: this state produces this UI.

**The type annotation on the atom.** `const usersStateAtom: typeof currentUsersAtom = Atom.make(result)` is not decoration. It forces the compiler to confirm that our simple atom is assignable where the real derived atom goes. If someone later changes the atom's type, this line breaks in the test file too, which is what you want.

**The defect test.** `Cause.die(new Error("boom"))` builds the unplanned kind of failure. Most codebases never test that branch because their tools cannot easily produce one; here it is three lines. If you take one habit from this chapter, take this one: the saddest path deserves a test too.

---

## 6.2 UserPagination: shared writable atoms

### What we're testing

`UserPagination` introduces two things the grid did not have: it _writes_ to an atom (the page number, through `useAtom`), and that atom is _shared_, meaning other components read the same value. It also derives its display from the users result (the total count becomes a page count). So the test cases split into rendering decisions and interaction consequences.

### Deciding the test cases

Rendering decisions first, from the component's early returns: it renders nothing while the result is `Initial`, nothing on `Failure`, and nothing when everything fits on one page. Then the interactions: clicking next must advance the page, and crucially, the _shared atom_ must change, not just the label; the buttons must disable at the edges.

That gives us four tests, folding the boundary conditions into their neighbors:

1. Renders nothing while the result is `Initial`.
2. Renders nothing when there is a single page.
3. Clicking next advances the page, updates the shared atom, and disables next on the last page.
4. Previous is disabled on the first page.

### The probe pattern

Test three raises a question worth pausing on. The component writes to `pageAtom`. How does a test observe an atom's value? It could read the registry directly, but there is a way that stays entirely inside user-visible behavior: render a tiny extra component that subscribes to the same atom and prints it.

```tsx
function PageProbe({ pageStateAtom }: { pageStateAtom: typeof pageAtom }) {
  const page = useAtomValue(pageStateAtom);
  return <div>Current page atom value: {page}</div>;
}
```

We call this a probe. Because it renders inside the same `RegistryProvider`, it shares the component's world, and asserting on its text proves that the write went through the atom and reached _other subscribers_, which is the entire point of shared state.

### The tests

Create `components/user-pagination.test.tsx`:

```tsx
import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { UserPagination } from "@/components/user-pagination";

import type { HttpError } from "@/errors";
import type { UsersResponse } from "@/schema/user-schema";
import { pageAtom } from "@/atoms/page";
import { currentUsersAtom } from "@/atoms/user";

function makeUsersStateAtom(usersCount: number): typeof currentUsersAtom {
  return Atom.make(
    AsyncResult.success<UsersResponse, HttpError>({ users: [], usersCount }),
  );
}

// A probe component that reads the same atom the component writes to, so
// the test can observe the shared state from the outside.
function PageProbe({ pageStateAtom }: { pageStateAtom: typeof pageAtom }) {
  const page = useAtomValue(pageStateAtom);
  return <div>Current page atom value: {page}</div>;
}

describe("UserPagination", () => {
  it("renders nothing while the users result is Initial", async () => {
    const screen = await render(
      <RegistryProvider>
        <UserPagination
          pageStateAtom={Atom.make(1) as typeof pageAtom}
          usersStateAtom={Atom.make(
            AsyncResult.initial<UsersResponse, HttpError>(true),
          )}
        />
      </RegistryProvider>,
    );
    expect(screen.container.childElementCount).toBe(0);
  });

  it("renders nothing when everything fits on one page", async () => {
    const screen = await render(
      <RegistryProvider>
        <UserPagination
          pageStateAtom={Atom.make(1) as typeof pageAtom}
          usersStateAtom={makeUsersStateAtom(4)}
        />
      </RegistryProvider>,
    );
    expect(screen.container.childElementCount).toBe(0);
  });

  it("moves to the next page and writes the shared page atom", async () => {
    const pageStateAtom = Atom.make(2) as typeof pageAtom;

    const screen = await render(
      <RegistryProvider>
        <UserPagination
          pageStateAtom={pageStateAtom}
          usersStateAtom={makeUsersStateAtom(20)}
        />
        <PageProbe pageStateAtom={pageStateAtom} />
      </RegistryProvider>,
    );

    await expect.element(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    await screen.getByRole("button", { name: /next/i }).click();

    await expect.element(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Current page atom value: 3"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /next/i }))
      .toBeDisabled();
  });

  it("disables the previous button on the first page", async () => {
    const screen = await render(
      <RegistryProvider>
        <UserPagination
          pageStateAtom={Atom.make(1) as typeof pageAtom}
          usersStateAtom={makeUsersStateAtom(20)}
        />
      </RegistryProvider>,
    );
    await expect
      .element(screen.getByRole("button", { name: /previous/i }))
      .toBeDisabled();
  });
});
```

### The parts that matter

**Fixture arithmetic.** The tests use `usersCount: 20`. Why 20? The app shows 8 users per page (`USERS_PER_PAGE` in `lib/constants.ts`), so 20 users make 3 pages, and page 2 of 3 has both buttons enabled. While building this course, an earlier draft used a count that produced 2 pages and the assertion on "Page 2 of 3" failed immediately. The lesson generalizes: when a fixture encodes arithmetic, derive it from the same constant the app uses, or leave a comment. Silent constants in fixtures are where good test suites go stale.

**The cast on the page atom.** `Atom.make(2) as typeof pageAtom` substitutes a plain writable atom for the URL-backed one. The real `pageAtom` has clamping logic in its write path; here we're testing the pagination component, not the page atom, so a plain atom is the honest substitute. The URL-backed behavior gets its own treatment in the next chapter.

**Ordering inside test three.** The test asserts the label, clicks, then asserts label, probe, and disabled state. Each assertion retries on its own, so the test tolerates however long the registry's scheduling takes without a single explicit wait.

---

## 6.3 UserSearchBar: atoms that live in the URL

### What we're testing

`searchQueryAtom` and `pageAtom` are writable atoms whose backing store is the browser URL: reading them parses `window.location.search`, and writing them updates the address bar through the history API. `UserSearchBar` connects an input to the query atom, and resets the page atom whenever the query changes. This is the chapter where running in a real browser stops being a preference and becomes the point: the component's observable behavior _is_ the address bar.

### Deciding the test cases

Think in terms of the two directions data flows, plus the interplay with the page:

1. URL to component: with no query in the URL, the input is empty and the clear button is hidden.
2. URL to component: with `?q=jane` present at mount, the input starts with "jane".
3. Component to URL: typing writes `?q=` and removes `?page=` (the reset behavior).
4. The escape hatch: the ESC button clears the input and the URL.

### The tests

Create `components/user-search-bar.test.tsx`:

```tsx
import { RegistryProvider } from "@effect/atom-react";
import { beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { UserSearchBar } from "@/components/user-search-bar";

import { pageAtom } from "@/atoms/page";
import { searchQueryAtom } from "@/atoms/search";

function renderSearchBar() {
  return render(
    <RegistryProvider>
      <UserSearchBar
        pageStateAtom={pageAtom}
        searchStateAtom={searchQueryAtom}
      />
    </RegistryProvider>,
  );
}

function searchParams() {
  return new URLSearchParams(window.location.search);
}

describe("UserSearchBar", () => {
  beforeEach(() => {
    // The search atoms read and write the real browser URL, so every test
    // starts from a clean address.
    window.history.replaceState({}, "", "/");
  });

  it("starts with an empty input and no clear button", async () => {
    const screen = await renderSearchBar();
    await expect.element(screen.getByRole("searchbox")).toHaveValue("");
    await expect
      .element(screen.getByRole("button", { name: /esc/i }))
      .not.toBeInTheDocument();
  });

  it("reads its initial value from the URL", async () => {
    window.history.replaceState({}, "", "/?q=jane");
    const screen = await renderSearchBar();
    await expect.element(screen.getByRole("searchbox")).toHaveValue("jane");
  });

  it("writes the query to the URL and resets the page while typing", async () => {
    window.history.replaceState({}, "", "/?page=3");
    const screen = await renderSearchBar();

    await userEvent.type(screen.getByRole("searchbox"), "jane");

    await expect.element(screen.getByRole("searchbox")).toHaveValue("jane");
    await expect.poll(() => searchParams().get("q")).toBe("jane");
    await expect.poll(() => searchParams().get("page")).toBeNull();
  });

  it("clears the query through the ESC button", async () => {
    window.history.replaceState({}, "", "/?q=jane");
    const screen = await renderSearchBar();

    await screen.getByRole("button", { name: /esc/i }).click();

    await expect.element(screen.getByRole("searchbox")).toHaveValue("");
    await expect.poll(() => window.location.search).toBe("");
  });
});
```

### The parts that matter

**The `beforeEach` reset.** This is the one place in the course where state can leak between tests, and it is worth understanding why. The registry is fresh per test (5.1), but the URL is not part of the registry. It belongs to the browser page, which Browser Mode reuses across tests in a file for speed. So tests that share a page must reset shared page-level state themselves. `window.history.replaceState({}, "", "/")` puts the address back to a known blank before each test. Whenever a test involves browser-global state (URL, local storage, cookies), your first question should be: who resets it?

**Arranging the URL before rendering.** Test two writes `?q=jane` into the address bar and then renders. This direction, world first and component second, is how you test any component that initializes from its environment. No prop can express "the URL already said jane"; only the URL can.

**`expect.poll` for non-elements.** The URL is not an element, so `expect.element` cannot watch it. `expect.poll(() => searchParams().get("q"))` retries an arbitrary read until the matcher passes, which absorbs the small delay between the atom write and the history update. This pairing, `expect.element` for the page and `expect.poll` for everything else, covers every asynchronous assertion you will ever need in Browser Mode.

**What we deliberately did not test.** The app debounces the query before fetching (the `debouncedSearchQueryAtom`), meaning it waits for typing to pause before acting. That behavior belongs to the atom graph, not to this component, and the search bar reads the undebounced atom. Keeping each test aimed at one component's own behavior is what keeps a suite fast to diagnose when it fails.

---

## 6.4 UserDetail: seeding runtime atoms

### What we're testing

`UserDetail` is our first component whose atoms would, left alone, perform real HTTP requests. It reads two runtime atoms from families, `userBasicAtom(id)` and `userAddressAtom(id)`, and renders them with independent states: the page shows the user card as soon as the basic data arrives, with a small placeholder animation (a skeleton) where the address will go. The component does not accept atoms as props; it calls the families itself. Time for seam two: seeding the registry.

### Deciding the test cases

The interesting behavior here is the _combination_ of two independent results. Enumerating both would give nine combinations; most are uninteresting. The four that carry all the product decisions:

1. Basic succeeded, address still loading: card now, skeleton where the address goes. This is the partial loading experience, the reason the data is split in two.
2. Both succeeded: the complete page.
3. Basic succeeded, address failed: the card stays, with an inline error only in the address slot. Errors should be as local as the data they belong to.
4. Basic failed: the whole page becomes a failure card, regardless of the address.

### The tests

Create `components/user-detail.test.tsx`:

```tsx
import { RegistryProvider } from "@effect/atom-react";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { UserDetail } from "@/components/user-detail";

import { ServerError, type HttpError } from "@/errors";
import type { UserAddress, UserBasic } from "@/schema/user-schema";
import { userAddressAtom, userBasicAtom } from "@/atoms/user";

type UserBasicResult = Atom.Type<ReturnType<typeof userBasicAtom>>;
type UserAddressResult = Atom.Type<ReturnType<typeof userAddressAtom>>;

const janeBasic: UserBasic = {
  id: "1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  company: { name: "Acme Corp", title: "Engineer" },
};

const janeAddress: UserAddress = {
  address: "123 Main St",
  city: "Springfield",
  state: "IL",
};

function renderUserDetail(options: {
  basicResult: UserBasicResult;
  addressResult: UserAddressResult;
}) {
  // The detail atoms are runtime atoms that would normally fetch over HTTP.
  // Seeding them through initialValues puts them directly into the state
  // each test wants, and no request is ever made.
  return render(
    <RegistryProvider
      initialValues={[
        Atom.initialValue(userBasicAtom("1"), options.basicResult),
        Atom.initialValue(userAddressAtom("1"), options.addressResult),
      ]}
    >
      <UserDetail id="1" />
    </RegistryProvider>,
  );
}

describe("UserDetail", () => {
  it("renders the user card while the address is still loading", async () => {
    const screen = await renderUserDetail({
      basicResult: AsyncResult.success<UserBasic, HttpError>(janeBasic),
      addressResult: AsyncResult.initial<UserAddress, HttpError>(true),
    });

    await expect
      .element(screen.getByRole("heading", { name: "Jane Doe" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("jane@example.com"))
      .toBeInTheDocument();
    expect(
      screen.container.querySelector('[data-slot="skeleton"]'),
    ).not.toBeNull();
    await expect
      .element(screen.getByText("123 Main St"))
      .not.toBeInTheDocument();
  });

  it("renders the full detail once both atoms have succeeded", async () => {
    const screen = await renderUserDetail({
      basicResult: AsyncResult.success<UserBasic, HttpError>(janeBasic),
      addressResult: AsyncResult.success<UserAddress, HttpError>(janeAddress),
    });

    await expect
      .element(screen.getByRole("heading", { name: "Jane Doe" }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("123 Main St")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Springfield, IL"))
      .toBeInTheDocument();
  });

  it("renders an inline error when only the address request failed", async () => {
    const screen = await renderUserDetail({
      basicResult: AsyncResult.success<UserBasic, HttpError>(janeBasic),
      addressResult: AsyncResult.failure<UserAddress, HttpError>(
        Cause.fail(
          new ServerError({ message: "Address unavailable", cause: null }),
        ),
      ),
    });

    await expect
      .element(screen.getByRole("heading", { name: "Jane Doe" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Address unavailable"))
      .toBeInTheDocument();
  });

  it("renders a failure card when the basic user data failed", async () => {
    const screen = await renderUserDetail({
      basicResult: AsyncResult.failure<UserBasic, HttpError>(
        Cause.fail(new ServerError({ message: "User not found", cause: null })),
      ),
      addressResult: AsyncResult.initial<UserAddress, HttpError>(true),
    });

    await expect.element(screen.getByText("Server Error")).toBeInTheDocument();
    await expect
      .element(screen.getByText("User not found"))
      .toBeInTheDocument();
  });
});
```

### The parts that matter

**Seeding matches reading, key by key.** The component will read `userBasicAtom("1")` because we render `<UserDetail id="1" />`. The seeds are for `userBasicAtom("1")`. Atom families return the same atom for the same key, so the seeded value is found. Seed `userBasicAtom("2")` by mistake and the component's read misses the seed, the runtime atom actually runs, and the test fails in a confusing way (more on that exact failure in chapter 7).

**Why the runtime atom never fetches.** A runtime atom runs its Effect when it is first read _without_ a value. Seeding gives it a value before the first read, so there is nothing to do. This is precisely how the real application avoids double fetching after server rendering, which means these tests exercise the same mechanism your production hydration path relies on.

**Deriving the result types.** The two type aliases at the top, built with `Atom.Type<ReturnType<...>>`, extract "the type of value this atom holds" from the atom itself. Writing `AsyncResult<UserBasic, HttpError>` by hand would also work today, but the alias tracks the atom if its definition evolves.

**The inline failure uses `Cause.fail`.** In 6.1 the grid took a plain error through `AsyncResult.fail`. This component reads the failure's cause directly (it calls `Cause.squash` internally), so the test builds the same structure the runtime would: a `Failure` wrapping a `Cause` built with `Cause.fail(typedError)`. When a component inspects causes, hand it causes.

---

## 6.5 UserDeleteDialog: swapping the service layer

### What we're testing

Everything so far was about reading state. `UserDeleteDialog` acts: it opens a confirmation dialog, and on confirm it calls `optimisticDeleteUserAtom`, which closes the dialog immediately, removes the user from the loaded list (the optimistic part), runs the real delete through `UserService`, and reports the outcome with a toast, a small transient notification. The mutation must actually run for any of this to happen, so this is the chapter for seam three: the component keeps its real atoms, the atoms keep their real logic, and only the service at the bottom is a fake.

### Deciding the test cases

A mutation has exactly three moments worth testing: before (does the confirmation step work?), success, and failure.

1. The trigger opens the dialog with the right name in it. Deletion is destructive; the confirmation step is a safety feature and deserves its own test.
2. Confirming closes the dialog immediately and shows the success toast. The immediacy _is_ the optimistic behavior as the user perceives it.
3. When the service fails, an error toast appears with the reason.

### The tests

Create `components/user-delete-dialog.test.tsx`:

```tsx
import { RegistryProvider } from "@effect/atom-react";
import { Effect, Layer, Stream } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { UserDeleteDialog } from "@/components/user-delete-dialog";

import { atomRuntime } from "@/atom-runtime";
import { ServerError, type HttpError } from "@/errors";
import type { User } from "@/schema/user-schema";
import { UserService } from "@/services/user-service";

const jane: User = {
  id: "1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  company: { name: "Acme Corp", title: "Engineer" },
  address: { address: "123 Main St", city: "Springfield", state: "IL" },
};

// A complete substitute for the real UserService. Only deleteUser matters
// for these tests; every other method reports itself as unimplemented if a
// test accidentally reaches it.
function makeTestLayer(deleteResult: Effect.Effect<void, HttpError>) {
  return Layer.succeed(UserService, {
    getUsers: () => Effect.die("not implemented"),
    getUsersStream: () => Stream.make({ users: [jane], hasMore: false }),
    getUser: () => Effect.die("not implemented"),
    getUserBasic: () => Effect.die("not implemented"),
    getUserAddress: () => Effect.die("not implemented"),
    addUser: () => Effect.die("not implemented"),
    deleteUser: () => deleteResult,
  });
}

function renderDialog(deleteResult: Effect.Effect<void, HttpError>) {
  return render(
    <RegistryProvider
      initialValues={[
        Atom.initialValue(atomRuntime.layer, makeTestLayer(deleteResult)),
      ]}
    >
      <UserDeleteDialog
        user={jane}
        trigger={<button type="button">Open delete dialog</button>}
      />
      <Toaster />
    </RegistryProvider>,
  );
}

describe("UserDeleteDialog", () => {
  it("opens the confirmation dialog from the trigger", async () => {
    const screen = await renderDialog(Effect.void);

    await screen.getByRole("button", { name: /open delete dialog/i }).click();

    const dialog = screen.getByRole("dialog");
    await expect
      .element(dialog.getByText("Delete Jane Doe?"))
      .toBeInTheDocument();
  });

  it("closes immediately and shows a success toast when the delete succeeds", async () => {
    const screen = await renderDialog(
      Effect.void.pipe(Effect.delay("50 millis")),
    );

    await screen.getByRole("button", { name: /open delete dialog/i }).click();
    await screen.getByRole("button", { name: /^delete$/i }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("User deleted successfully"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Jane Doe has been deleted."))
      .toBeInTheDocument();
  });

  it("shows an error toast when the delete fails", async () => {
    const screen = await renderDialog(
      Effect.fail(
        new ServerError({ message: "Server returned status 500", cause: null }),
      ).pipe(Effect.delay("50 millis")),
    );

    await screen.getByRole("button", { name: /open delete dialog/i }).click();
    await screen.getByRole("button", { name: /^delete$/i }).click();

    await expect
      .element(screen.getByText("Failed to delete Jane Doe"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Server returned status 500"))
      .toBeInTheDocument();
  });
});
```

### The parts that matter

**The whole test double is one parameter wide.** `makeTestLayer(deleteResult)` takes a single Effect describing what `deleteUser` should do: succeed, succeed slowly, or fail with a particular error. Everything a test needs to vary is that one value, handed in through `renderDialog`. This is the layer-swap seam at its best: fully typed, one line per scenario.

**The delay is doing real work.** `Effect.delay("50 millis")` makes the fake service take a moment, like a network would. It is what creates the window in which "the dialog closed _before_ the result arrived" is observable at all. With an instant fake, the optimistic close and the completion would land together and the test would prove less. When testing optimistic UI, give your fakes latency.

**Real toasts, no mocks.** We render sonner's `<Toaster />` next to the component and assert on the toast text as ordinary page content. In a real browser the toast is just DOM. The alternative you may have seen, replacing the toast module with `vi.mock` and asserting it was called, verifies a function call happened; this verifies the user saw the message. Prefer the version the user can see.

**One method implemented, the rest loud.** Note `getUsersStream` in the fake returns a small real stream rather than dying: the optimistic atom sits on top of the loaded list, so the list's source must exist. Every other method dies with "not implemented". If a future change makes the dialog touch another method, these tests fail with that exact phrase instead of passing by accident. Write fakes that refuse to be more capable than the test requires.

---

## 6.6 UserLoadMore: pull atoms and streams

### What we're testing

`usersLoadMoreAtom` is a pull atom: it sits on a stream of pages from `getUsersStream`, takes the first page when mounted, and takes one more page each time it is called. `UserLoadMore` renders the button that does the calling, hides itself when the last loaded page says there is nothing more, and renders an error state with a retry button when the stream fails. Retry goes through `useAtomRefresh`, which rebuilds the atom from scratch.

This is seam three again, but the fake now returns a stream, and the tests exercise a sequence over time rather than a single call.

### Deciding the test cases

The component has three states (button, nothing, error) and two behaviors (pull on click, refresh on retry). Three tests cover the whole matrix:

1. With two pages available: the button shows, a click pulls the second page, and the button disappears because the second page is the last.
2. With a failing stream: the error message and a retry button appear.
3. With a stream that fails once and then works: clicking retry recovers into the button state. This one proves the refresh actually rebuilds the stream rather than replaying the old broken one.

### The tests

Create `components/user-load-more.test.tsx`:

```tsx
import { RegistryProvider } from "@effect/atom-react";
import { Effect, Layer, Stream } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { UserLoadMore } from "@/components/user-load-more";

import { atomRuntime } from "@/atom-runtime";
import { ServerError } from "@/errors";
import type { PageChunk, User } from "@/schema/user-schema";
import { UserService } from "@/services/user-service";

function makeUser(id: string, firstName: string, lastName: string): User {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    company: { name: "Acme Corp", title: "Engineer" },
    address: { address: "123 Main St", city: "Springfield", state: "IL" },
  };
}

const pageOne: PageChunk = {
  users: [makeUser("1", "Jane", "Doe")],
  hasMore: true,
};
const pageTwo: PageChunk = {
  users: [makeUser("2", "John", "Smith")],
  hasMore: false,
};

function layerWithStream(
  makeStream: () => Stream.Stream<PageChunk, ServerError>,
) {
  return Layer.succeed(UserService, {
    getUsers: () => Effect.die("not implemented"),
    getUsersStream: makeStream,
    getUser: () => Effect.die("not implemented"),
    getUserBasic: () => Effect.die("not implemented"),
    getUserAddress: () => Effect.die("not implemented"),
    addUser: () => Effect.die("not implemented"),
    deleteUser: () => Effect.die("not implemented"),
  });
}

function renderLoadMore(
  makeStream: () => Stream.Stream<PageChunk, ServerError>,
) {
  return render(
    <RegistryProvider
      initialValues={[
        Atom.initialValue(atomRuntime.layer, layerWithStream(makeStream)),
      ]}
    >
      <UserLoadMore />
    </RegistryProvider>,
  );
}

describe("UserLoadMore", () => {
  it("shows the button while more pages exist and hides it after the last page", async () => {
    const screen = await renderLoadMore(() =>
      // One chunk per page, exactly like Stream.paginate in the real service.
      Stream.make(pageOne).pipe(Stream.concat(Stream.make(pageTwo))),
    );

    const button = screen.getByRole("button", { name: /show more/i });
    await expect.element(button).toBeInTheDocument();

    await button.click();

    await expect.element(button).not.toBeInTheDocument();
  });

  it("shows the error state with a retry button when the stream fails", async () => {
    const screen = await renderLoadMore(() =>
      Stream.fail(
        new ServerError({ message: "Server returned status 500", cause: null }),
      ),
    );

    await expect
      .element(screen.getByText("Server returned status 500"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /try again/i }))
      .toBeInTheDocument();
  });

  it("recovers after a retry when the next attempt succeeds", async () => {
    let attempts = 0;
    const screen = await renderLoadMore(() => {
      attempts += 1;
      return attempts === 1
        ? Stream.fail(
            new ServerError({
              message: "Server returned status 500",
              cause: null,
            }),
          )
        : Stream.make(pageOne).pipe(Stream.concat(Stream.make(pageTwo)));
    });

    await screen.getByRole("button", { name: /try again/i }).click();

    await expect
      .element(screen.getByRole("button", { name: /show more/i }))
      .toBeInTheDocument();
  });
});
```

### The parts that matter

**The chunk shape of the fake stream.** The one line in this chapter that will save you an afternoon:

```tsx
Stream.make(pageOne).pipe(Stream.concat(Stream.make(pageTwo)));
```

Why not `Stream.make(pageOne, pageTwo)`? Because streams deliver values in chunks, groups of values that travel together for efficiency, and `Stream.make` with two arguments produces _one chunk containing both pages_. A pull atom pulls one chunk at a time. With both pages in the first chunk, the very first pull delivers everything, the last page's `hasMore: false` wins, and the button never appears. The real service builds its stream with `Stream.paginate`, which emits one chunk per page, so a faithful fake must do the same: one page per chunk, which `Stream.make(a).pipe(Stream.concat(Stream.make(b)))` guarantees. We found this the honest way, by watching the first version of this test fail. The general rule: **when you fake a stream for a pull atom, match the chunking, not just the values.**

**A stateful fake for the retry test.** The `attempts` counter makes the factory return a different stream on the second construction. This works because `useAtomRefresh` rebuilds the atom, which re-runs the Effect, which calls `getUsersStream` again. The passing test is therefore proof of the refresh semantics themselves: a replayed old stream would fail again, a rebuilt one succeeds.

**Locators can be reused.** Test one stores the button locator in a variable and uses it through its whole lifecycle: assert present, click, assert absent. Since a locator is a search description rather than a snapshot (4.2), the same variable is valid before and after the DOM changed under it.

---

## 6.7 HydrationBoundary: testing server state transfer

### What we're testing

The `HydrationBoundary` in this codebase is hand-written, and it solves a subtle problem. Dehydrated atom state arrives from the server; some of those atoms have never been seen by the browser registry, and some may already have a live value (for example after client-side navigation back to a page). The boundary hydrates the two groups differently: unknown atoms are loaded during the first render, so children can read them immediately, while atoms that already exist are updated after the render commits, so the update flows through the normal subscription path.

Unlike every other chapter, the component under test renders nothing of its own; its entire job is a side effect on the registry. So our tests watch the effect through a probe component that reads the hydrated atom.

### Deciding the test cases

The two code paths give us exactly two tests:

1. Hydrating an atom the registry has never seen: the probe must show the server value immediately.
2. Hydrating an atom that already has a value: the probe must end up showing the server value, replacing the existing one.

### The tests

Create `components/hydration-boundary.test.tsx`:

```tsx
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Schema } from "effect";
import { Atom, AtomRegistry, Hydration } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { HydrationBoundary } from "@/components/hydration-boundary";

const countAtom = Atom.make(0).pipe(
  Atom.serializable({
    key: "test-count",
    schema: Schema.Number,
  }),
);

function CountValue() {
  const count = useAtomValue(countAtom);
  return <div>Count: {count}</div>;
}

// Builds dehydrated state the way a server would: seed a separate
// registry, then dehydrate it.
function makeDehydratedState(value: number) {
  const serverRegistry = AtomRegistry.make();
  serverRegistry.set(countAtom, value);
  return Hydration.dehydrate(serverRegistry);
}

describe("HydrationBoundary", () => {
  it("hydrates atoms that are not yet in the client registry", async () => {
    const registry = AtomRegistry.make();

    const screen = await render(
      <RegistryContext.Provider value={registry}>
        <HydrationBoundary state={makeDehydratedState(5)}>
          <CountValue />
        </HydrationBoundary>
      </RegistryContext.Provider>,
    );

    await expect.element(screen.getByText("Count: 5")).toBeInTheDocument();
  });

  it("defers hydration for atoms that already have a value", async () => {
    const registry = AtomRegistry.make();
    registry.set(countAtom, 1);

    const screen = await render(
      <RegistryContext.Provider value={registry}>
        <HydrationBoundary state={makeDehydratedState(9)}>
          <CountValue />
        </HydrationBoundary>
      </RegistryContext.Provider>,
    );

    await expect.element(screen.getByText("Count: 9")).toBeInTheDocument();
  });
});
```

### The parts that matter

**Two registries, playing server and client.** `makeDehydratedState` creates a throwaway registry, sets a value into it, and calls `Hydration.dehydrate` on it. That is a faithful miniature of what the real server does per request. The registry under test is a second one, created with `AtomRegistry.make()` and provided through `RegistryContext.Provider` directly, because this test needs to prepare the registry (test two sets a value first) before React ever sees it. When you need to touch the registry before rendering, create it yourself and provide it via the context; `RegistryProvider` is the convenience wrapper for when you do not.

**A serializable test atom.** Only atoms marked with `Atom.serializable` (a key plus a schema describing how to encode the value) participate in dehydration. The test defines its own tiny `countAtom` rather than using an application atom, which keeps the test about the boundary's mechanics and nothing else. The `key` is the identity that matches the dehydrated entry to the atom on the client side; the schema is what decodes the serialized value safely.

**The second test is the subtle one.** With `registry.set(countAtom, 1)` before rendering, the boundary must not clobber the live value during render; it queues the update for after commit. The retrying assertion happily absorbs that deferral: it simply keeps checking until "Count: 9" is on the page. The first test's value, in contrast, must be visible on first render, and it is. If you ever modify the boundary (the author of this codebase encourages you to own this file), these two tests are the safety net that tells you whether both timing paths still work.

---

# 7. Best practices and gotchas

Everything in this chapter was earned while building the test suite you just wrote. Skim it now, then return whenever a test misbehaves; the odds are good its symptom is on this page.

## Practices to keep

**One registry per test, always.** Wrap every render in a fresh `RegistryProvider` (or a fresh `AtomRegistry.make()` when you need pre-render access). The moment two tests share a registry, order starts to matter, and a suite where order matters is a suite you can no longer trust or parallelize.

**Choose the shallowest seam that works.** Prop injection for rendering states, registry seeding for atoms the component reads directly, layer swapping only when the component must actually run work. Depth costs setup and widens what a failure could mean. A test that swaps the layer to check a heading renders is doing archaeology with a bulldozer.

**Make fakes refuse extra work.** Unused service methods should be `Effect.die("not implemented")`, never quiet successes. A fake that politely succeeds at everything converts "the component made an unexpected call" from a loud failure into invisible wrongness.

**Give mutation fakes latency.** A delay of 50 milliseconds in a fake `deleteUser` is what makes "the dialog closed before the server answered" a testable claim. Instant fakes collapse the timeline your optimistic UI exists to handle.

**Assert what the user sees, not what the code did.** Real toasts over mocked toast functions. Probe components over reading the registry. URL assertions over spying on history calls. Every time you assert one level closer to the user, the test survives one more refactor.

**Let retrying assertions do the waiting.** No sleeps, no arbitrary timeouts, no manual polling loops. `await expect.element(...)` and `await expect.poll(...)` express the destination and absorb the journey. If you feel the need for a sleep, you are usually missing an assertion on the intermediate state instead.

**Type your hand-built state.** Annotate substitute atoms (`const a: typeof currentUsersAtom = Atom.make(...)`) and spell out `AsyncResult` type parameters. The annotations are what keep the tests tethered to the app's types as they evolve.

## Gotchas, by symptom

**A test involving the URL passes alone and fails in the file.** Browser Mode reuses the page across tests in a file, and the URL is page state, not registry state. Reset it in `beforeEach` with `window.history.replaceState({}, "", "/")`. The same applies to local storage and cookies if your atoms use them.

**A seeded runtime atom fetches anyway (or renders a network error).** The seed key and the read key do not match. `userBasicAtom("1")` and `userBasicAtom("2")` are different atoms; so are family atoms called with keys that are equal-looking but different values. Check the id the component receives against the id in `Atom.initialValue`. When a seed misses, the runtime atom runs for real, and in a test environment with no server that means a `ClientError` where you expected data.

**The show-more button never appears when faking a stream.** Your fake delivers all its pages in one chunk. `Stream.make(a, b)` is one chunk with two values; a pull atom consumes chunk by chunk, so it swallowed everything at once. Build one chunk per page: `Stream.make(a).pipe(Stream.concat(Stream.make(b)))`. Faithfulness to chunking is part of faithfulness to the service.

**An assertion never fires and the test times out, with the element visibly there.** Look for a missing `await`. Both `expect.element` and `expect.poll` return promises; unawaited, they detach from the test and their failures surface nowhere useful. Turn on the lint rule for floating promises if your setup supports it.

**Type errors deep inside library types after an upgrade.** Your `effect` and `@effect/atom-react` versions no longer match. They ship in lockstep and must be pinned to the same exact beta. Check with `npm ls effect` and re-pin.

**`render` complains or returns something without locators.** In the versions used here, `render` from `vitest-browser-react` is asynchronous. It must be awaited, and the locators live on the awaited result. If you wrote `const screen = render(...)` without `await`, every subsequent line fails with "property does not exist on type Promise".

**A test file works in the app but not in tests, complaining about JSX.** The Vite React plugin is missing from `vitest.config.ts`. The application's build handles JSX through Next.js; tests build through Vite and need `@vitejs/plugin-react` declared explicitly.

**Old tutorials tell you to configure `provider: "playwright"` as a string.** That was the API before Vitest 4. The current configuration imports the provider as a function from `@vitest/browser-playwright` and passes `provider: playwright()`. If your configuration mixes the two eras, the error messages are unhelpful; make sure both the package and the syntax come from the same era.

**Something needs `document` or `window` at module load time in a component file.** Remember that these tests run in a real browser, so browser globals exist. But the reverse gotcha applies to any code that later runs during server rendering: the codebase guards such code with `typeof window !== "undefined"` checks, as in `userAtom`. Tests running in a browser will always take the browser branch; be aware that the server branch is then only covered by your server rendering itself.

---

# 8. Appendix: what changed in the latest Effect v4 beta

The repository is pinned to the latest Effect v4 beta at the time of writing. If you are coming from an earlier beta of this codebase, or updating your own project, here is every change we made to bring the code up to date, in the order you are likely to hit the errors.

**1. `ServiceMap` is gone; services are defined through `Context`.** The service class in `services/user-service.ts` previously extended `ServiceMap.Service` with a `make` option. It now uses the `Context.Service` pattern with the implementation defined separately:

```ts
const make = Effect.gen(function* () {
  // ... build and return the service methods, unchanged ...
});

export class UserService extends Context.Service<
  UserService,
  Effect.Success<typeof make>
>()("app/UserService") {
  static layer = Layer.effect(UserService, make).pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}
```

The method bodies did not change at all; only the wrapper did. `Effect.Success<typeof make>` derives the service's shape from the implementation, so nothing is written twice.

**2. `Schema.Defect` is now a constructor call.** Anywhere a schema declared a defect-typed field, `cause: Schema.Defect` becomes `cause: Schema.Defect()`. This appears in `errors/index.ts`. The old spelling produces a cascade of confusing type errors in every schema that touches the error union, so fix this one first.

**3. `Schema.withDecodingDefault` takes an Effect now.** Where the home page's search parameter schema previously passed a plain function returning the default, it now passes an Effect producing it:

```ts
q: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
```

**4. `HttpClientRequest.bodyJson` surfaces a body encoding error.** The `addUser` method's error channel gained `HttpBodyError`, which is not part of our `HttpError` union. It is handled next to the existing error mappings:

```ts
Effect.catchTag("HttpBodyError", (error) =>
  Effect.fail(
    new ClientError({
      message: "Could not encode the request body.",
      cause: error,
    }),
  ),
),
```

**5. The AsyncResult builder gained `.exhaustive()`, and we use it.** Both builder components (`user-grid.tsx`, `user-detail.tsx`) previously ended with `.render()`, which quietly allows unhandled cases. They now end with `.exhaustive()`, which only type-checks when every case is handled. Adopting it in the grid forced two additions, and both are improvements:

- `.onInterrupt(() => null)`: interruption (the query being cancelled, for example on unmount) is now an explicit decision instead of an implicit one.
- `.onErrorTag("ConfigError", ...)`: this one is genuinely interesting. The runtime's layer can itself fail, for example when configuration is missing, and that failure flows into the atom's error channel. The exhaustive builder refused to compile until the component said what a configuration failure looks like. A method that turns "error case nobody thought about" into a compile error is exactly the kind of ally you want; end every builder with `.exhaustive()`.

**6. Version pins.** `effect` and `@effect/atom-react` are pinned exactly, to the same beta number, with no version range operator in front. All Effect v4 ecosystem packages release together; treat their versions as one version.

---

# 9. Conclusion

Step back and look at what you can now do.

You can render a component in any server state it will ever encounter, including the states that are hardest to reach by hand: the defect, the partial failure, the refresh in flight. You can hand components pre-made atoms, seed a registry so runtime atoms wake up already fed, and swap an entire service layer for a typed fake that the compiler keeps synchronized with reality. You can test mutations, optimistic updates, toasts, URL-backed state, streamed pagination, and the hydration hand-off from server to browser. And every one of those tests runs in a real browser, finding elements the way users find them, waiting the way reality waits.

More important than any single technique is the shape of the whole. Notice what was never needed: no module mocking, no network interception, no fetch stubbing, no fake timers. That absence is not luck. Effect Atom is built out of values (atoms, results, layers) that are as easy to construct in a test as they are in production, and the registry gives every test a private world to construct them in. Testing wisdom usually says "design your code for testability"; here the state management library did most of that design for you. Your job was to learn the three seams and to keep choosing the shallowest one.

Where to go from here:

- **Extend the suite.** The add-user form went untested in this course; it combines a form library, a mutation atom, and a redirect. Every technique it needs is in chapters 6.5 and 6.2. It is the natural exercise.
- **Test your own atoms' logic directly** when it grows beyond what component tests should carry: pure decision code can be pulled out and unit tested, and if it is Effect code, that is exactly where the `@effect/vitest` bridge from chapter 5.4 becomes the right tool.
- **Run the suite in continuous integration.** Playwright installs cleanly on standard CI runners with `npx playwright install --with-deps chromium`; from there, `npm test` is the whole pipeline.
- **Keep the pins moving.** Effect v4 is in beta and evolving; chapter 8 is the template for what an upgrade looks like. Move both packages together, run the type checker, run the tests, and let the exhaustive builders tell you what new cases the world has invented.

The suite you built is small, but it is not a toy: it exercises the same seams, the same states, and the same failure modes you will meet in any production application built on Effect Atom. When you meet them there, you will already know exactly where to grab on.

_End of course._
