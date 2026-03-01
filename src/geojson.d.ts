declare module "*.geojson" {
  const value: {
    type: string;
    features: Array<{
      type: string;
      properties?: Record<string, unknown>;
      geometry: {
        type: string;
        coordinates: unknown;
      };
    }>;
  };
  export default value;
}

