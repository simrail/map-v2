export type Railcar = {
	/** The id of the railcar, usually a more consecutive version of the api. */
	id: string;
	/** The name for the railcar that is exposed by the SimRail api. */
	apiName: string;
	/** The steam id of the DLC that is required to use the railcar in game, null if freely available. */
	requiredDlcId: string | null;
	/** The type of rail vehicle that is represented */
	railcarType: "LOCOMOTIVE" | "ELECTRIC_MULTIPLE_UNIT" | "WAGON";

	/** The type identifier of the railcar. */
	typeIdentifier: string;
	/** Exact designation of the railcar. */
	designation: string;

	/** The name of the wagon producer. */
	producer: string;
	/** A string representation of the years that the railcar was produced in. */
	yearsOfProduction: string;

	/** The weight of the railcar, without any freight. */
	weight: number;
	/** The length of the railcar. */
	length: number;
	/** The width of the railcar. */
	width: number;
	/** The maximum speed that can be driven with the railcar. */
	maxSpeed: number;

	/** Indicates if this railcar can be used to transport freight (main purpose). */
	freightTransportation: boolean;
	/** Indicates if this railcar can be used to transport passengers (main purpose). */
	passengerTransportation: boolean;
};
