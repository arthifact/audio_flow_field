# Audio Flow Field

[Open the app](https://arthifact.github.io/audio_flow_field/)

Audio-reactive particle flow field built with p5.js and Web Audio. Load an audio file, press Play, and choose a trail color. Audio loops and is processed locally.

Particles follow a Perlin-noise field. The FFT measures bass $B$, midrange $M$, and treble $T$ on a scale of 0–255. They bend the force at each grid cell:

$$
\mathbf{F} = m R(\phi)\begin{pmatrix}\cos\theta + M/255\\\sin\theta + (T-B)/255\end{pmatrix}
$$

$\theta$ is the noise angle; $m$ increases with low-frequency energy, with a small motion floor for bass-light recordings. $R(\phi)$ slowly turns the field. Neighboring forces blend smoothly. Particles accelerate along $\mathbf{F}$ with a speed limit, wrap at the edges, and leave fading trails. Sudden bass rises add an outward burst. Loudness changes particle count; window size sets density, thickness, and movement scale. Quiet recordings gain visual sensitivity without changing playback volume.

To run locally with Node.js 22 or newer:

```sh
npm ci
npm start
```

Open <http://127.0.0.1:8000>. Build the static site with `npm run build`.
