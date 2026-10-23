# Parity fixture

Every construct the parity spec checks, once each. Both editors must render all of them.

## Images

![Relative image](assets/pic.png)

![Web image](https://images.e2e.test/web.png)

![Data image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPQqsomCTGMahjVMHw1AADSUg8QUWy18QAAAABJRU5ErkJggg==)

<img src="assets/pic.png" alt="HTML image" width="16">

<picture>
<source srcset="assets/pic.png">
<img src="assets/pic.png" alt="Picture image" width="16">
</picture>

<img src="assets/pic.png" srcset="assets/pic.png 1x" alt="Srcset image" width="16">

<audio src="assets/tone.wav" controls></audio>

## Diagram

```mermaid
graph TD
  Start --> Finish
```

## Table

| Fruit | Colour |
| ----- | ------ |
| Lime  | Green  |

## Task list

- [x] Done task
- [ ] Open task

## Strikethrough

This is ~~struck out~~ text.

## Callout

> [!NOTE]
> Callout body text.

## Code

```js
const answer = 42;
```

## Math

Inline $a^2 + b^2 = c^2$ math.

$$
\int_0^1 x\,dx
$$

## Footnotes

A claim with a footnote.[^1]

[^1]: The footnote text.
