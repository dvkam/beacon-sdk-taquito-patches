/**
 * @internalapi
 * @category Tezos
 */
export type MichelineMichelsonV1Expression =
  | { int: string }
  | { string: string } // eslint-disable-line id-blacklist
  | { bytes: string }
  | MichelineMichelsonV1Expression[]
  | {
      // Protocol names evolve independently of Beacon; runtime helpers check the installed codec.
      prim: string
      args?: MichelineMichelsonV1Expression[]
      annots?: string[]
    }
