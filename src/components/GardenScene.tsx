import type { AssetMap } from '../data/assets'
import type { FlowerChoice, FlowerId } from '../data/flowers'
import { FLOWERS } from '../data/flowers'
import { FlowerArt } from './FlowerArt'

type VisualGameStep = 'welcome' | 'choose' | 'plant' | 'sun' | 'rain' | 'grow' | 'reveal' | 'final'

interface GardenSceneProps {
  assets: AssetMap
  step: VisualGameStep
  selected: FlowerChoice | null
  completed: FlowerId[]
  availableFlowers?: FlowerChoice[]
  onChooseFlower?: (flower: FlowerChoice) => void
  planted: boolean
  sunny: boolean
  raining: boolean
  grown: boolean
}

export function GardenScene({
  assets,
  step,
  selected,
  completed,
  availableFlowers = [],
  onChooseFlower,
  planted,
  sunny,
  raining,
  grown,
}: GardenSceneProps) {
  const showSun = step === 'sun' || sunny
  const showCloud = step === 'rain' || raining
  const pot = raining || step === 'reveal'
    ? assets.pots.watered
    : planted
      ? assets.pots.planted
      : assets.pots.empty

  return (
    <div className={`garden-scene garden-scene--${step} ${sunny ? 'garden-scene--sunny' : ''}`}>
      <img className="garden-scene__background" src={assets.background} alt="" />

      <img
        className={`garden-weather garden-weather--sun ${showSun ? 'is-visible' : ''} ${sunny ? 'is-active' : ''}`}
        src={assets.sun}
        alt=""
      />
      <img
        className={`garden-weather garden-weather--cloud ${showCloud ? 'is-visible' : ''}`}
        src={assets.cloud}
        alt=""
      />

      {raining && (
        <div className="rain" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
      )}

      <div className="garden-scene__finished" aria-label="Completed flowers">
        {FLOWERS.filter((flower) => completed.includes(flower.id)).map((flower) => (
          <FlowerArt key={flower.id} flower={flower} frames={assets.flowers[flower.id]} grown compact />
        ))}
      </div>

      {step === 'choose' && onChooseFlower && (
        <div className="garden-seed-options" aria-label="Choose a seed packet">
          {availableFlowers.map((flower) => (
            <button
              key={flower.id}
              className={`garden-seed-option garden-seed-option--${flower.id}`}
              type="button"
              onClick={() => onChooseFlower(flower)}
            >
              <img src={assets.seeds[flower.id].packet} alt="" />
              <span>{flower.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pot-area">
        {selected && (
          <img
            className={`seed-flight ${planted ? 'seed-flight--planted' : ''}`}
            src={assets.seeds[selected.id].seed}
            alt=""
          />
        )}

        {selected && planted && (
          <FlowerArt flower={selected} frames={assets.flowers[selected.id]} grown={grown} />
        )}

        <img className="pot" src={pot} alt="Flower pot" />
      </div>

      <img className="garden-scene__foreground" src={assets.foreground} alt="" />
    </div>
  )
}
