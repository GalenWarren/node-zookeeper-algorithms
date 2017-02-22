/**
* Custom exception indicating a bad node component was encountered
*/
export class InvalidNodeComponentError extends Error {
  /**
  * Create the exception
  * @param {string} component - The invalide component
  */
  constructor(component) {
    super();
    this.message = `Invalid node component: ${component}`;
  }
}
