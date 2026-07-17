const RAY_COUNT = 12

export function SunRays() {
  return (
    <span className="sun-rays" aria-hidden="true">
      <svg viewBox="0 0 220 220" focusable="false">
        <g>
          {Array.from({ length: RAY_COUNT }, (_, index) => (
            <line
              key={index}
              x1="110"
              y1="8"
              x2="110"
              y2={index % 3 === 0 ? 38 : 44}
              transform={`rotate(${index * (360 / RAY_COUNT)} 110 110)`}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}
