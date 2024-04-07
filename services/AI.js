import { readFileSync } from 'fs';
import Instructor from "@instructor-ai/instructor";
import OpenAI from 'openai'
import { z } from "zod"
import logger from '../utils/logger.js'
import yaml from 'js-yaml'
import { v4 as uuidv4 } from 'uuid'
import search from '../schemas/jsons/search.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_AI_KEY,
})
const openai_config = JSON.parse(readFileSync('./config/openai.json'))
const registry_config = JSON.parse(readFileSync('./config/registry.json'))

class AI {
    
    constructor() {
        this.context = [];
        this.action = null;
        this.instructorClient = Instructor({
          client: openai,
          mode: "TOOLS"
        })
    }
    
    /**
     * Function to get the action from text. Works better without the context.
     * @param {*} text 
     * @param {*} context 
     * @returns 
     */
    async get_beckn_action_from_text(text, context=[]){
        const openai_messages = [
            { role: 'system', content: `Your job is to analyse the latest user input and check if it is one of the actions given in the following json with their descriptions : ${JSON.stringify(openai_config.SUPPORTED_ACTIONS)}` }, 
            { role: 'system', content: `You must return a json response with the following structure : {'action':'SOME_ACTION_OR_NULL'}`},
            { role: 'system', content: `Beckn actions must be called in the given order search > select > init > confirm. For e.g. confirm can only be called if init has been called before.`},
            { role: 'system', content: `'action' must be null if its not from the given set of actions. For e.g. planning a trip is not an action. 'find hotels near a place' is a search action.` },
            ...context, 
            { role: 'user', content: text }
        ]
        
        let response = {
            action: null,
            response: null
        }
        try{
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID,
                temperature: 0,
                response_format: { type: 'json_object' }
            })
            response = JSON.parse(completion.choices[0].message.content);
        }
        catch(e){
            logger.error(e);
        }

        logger.info(`Got action from text : ${JSON.stringify(response)}`)
        return response;
    }

    /**
     * Get response for general query
     * @param {*} instruction 
     * @param {*} context 
     * @returns 
     */
    async get_ai_response_to_query(instruction, context=[], profile = {}){
        const openai_messages = [
            { role: 'system', content: 'If you are asked to prepare an itinerary or plan a trip, you should have information about the user preferences such as journey dates, journey destination, number of members, mode of transport etc.'},
            { role: 'system', content: 'You must come back with a response immedietaley, do not respond back saying that you will come back with a resopnse.'},
            { role: 'system', content: 'While preparing an itinerary, you should also share a short list of bookings that needs to be made and ask the user which one they want to book first.'},
            { role: 'system', content: `User profile : ${JSON.stringify(profile)}`},
            ...context,
            { role: 'user', content: instruction}
        ]
        
        let response = {
            action: null,
            response: null
        }
        try{
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID
            })
            response = completion.choices[0].message.content;
        }
        catch(e){
            logger.error(e);
        }

        logger.info(`Got response from AI for a general query : ${response}`)
        return response;
    }
    
    /**
     * Get the right schema for a given action
     * @returns 
     */
    async get_schema_by_action() {
        let schema = false;

        if(this.action?.action){
            try {
                const filePath = `./schemas/core_1.1.0/${this.action?.action}.yml`;
                schema = yaml.load(readFileSync(filePath, 'utf8'));
                
            } catch (error) {
                logger.error(error);
            }
        }
        else{
            logger.error(`No action found in the instance.`);
        }

        logger.info(`Found schema for action : ${this.action?.action}`)
        return schema;
    }

    /**
     * Get beckn context for a given instruction
     * @param {*} instruction 
     * @param {*} context 
     * @returns 
     */
    async get_context_by_instruction(instruction, context=[]){
        
        const desired_structure = {
            action: this.action?.action,
            version: 'VERSION_AS_PER_REGISTRY',
            domain:`DOMAIN_AS_PER_REGISTRY_AND_INSTRUCTION_GIVEN_BY_USER`,
            message_id : uuidv4(),
            transaction_id: uuidv4(),
            base_url: 'AS_PER_REGISTRY',
            bap_id: 'AS_PER_REGISTRY',
            bap_uri: 'AS_PER_REGISTRY',
        }

        const openai_messages = [
            { role: 'system', content: `Your job is to analyse the given instruction, action and registry details and generated a config json in the following structure : ${JSON.stringify(desired_structure)}` },
            { role: 'system', content: `Registry  : ${JSON.stringify(registry_config)}` },
            { role: 'system', content: `Instruction : ${instruction}` },
            { role: 'system', content: `Action : ${this.action?.action}` },
            ...context.filter(c => c.role === 'user')
        ]

        try {
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID, 
                temperature: 0,
                response_format: { type: 'json_object' },
            })
            let response = JSON.parse(completion.choices[0].message.content)            
            logger.info(`Got context from instruction : ${JSON.stringify(response)}`);
            return response;
        } catch (e) {
            logger.error(e)
            return {}
        }
    }

    /**
     * Get beckn payload based on instruction, hostorical context, beckn context and schema
     * @param {*} instruction 
     * @param {*} context 
     * @param {*} beckn_context 
     * @param {*} schema 
     * @returns 
     */
    async get_beckn_request_from_text(instruction, context=[], beckn_context={}, schema={}, profile={}){

        logger.info(`Getting beckn request from instruction : ${instruction}`)
        let action_response = {
            status: false,
            data: null,
            message: null
        }        

        let openai_messages = [
            { "role": "system", "content": `Schema definition: ${JSON.stringify(schema)}` },
            ...openai_config.SCHEMA_TRANSLATION_CONTEXT,
            {"role": "system", "content": `This is the user profile that you can use for transactions : ${JSON.stringify(profile)}`},
            {"role": "system", "content": `Following is the conversation history`},
            ...context,
            { "role": "user", "content": instruction }
        ]
        
        try{
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID,
                response_format: { type: 'json_object' },
                temperature: 0,
            })
            const jsonString = completion.choices[0].message.content.trim()
            logger.info(`Got beckn payload`)
            logger.info(jsonString)
            logger.info(`\u001b[1;34m ${JSON.stringify(completion.usage)}\u001b[0m`)
            
            let response = JSON.parse(jsonString)
            
            // Corrections
            response.body.context = {
                ...response.body.context,
                ...beckn_context
            };
            response.url = `${beckn_context.base_url}/${beckn_context.action}`

            action_response = {...action_response, status: true, data: response}
        }
        catch(e){
            logger.error(e);
            action_response = {...action_response, message: e.message}
        }
        
        
        return action_response;
    }

    async generate_search_request_from_text(instruction, context=[], beckn_context={}, schema={}, profile={}) {
      logger.info(`Getting beckn request from instruction : ${instruction}`)

      const TagSchema = z.object({
        descriptor: z.object({
          code: z.string().describe("Standardized code of the tag. Usually the key of a key-value pair.")
        }),
        value: z.string().describe("The value of of a key-value pair.")
      }).describe("Usually used to describe extended attributes as key-value pairs.")

      const TagGroupSchema = z.object({
        descriptor: z.object({
          code: z.string().describe("Standardized code of the tag group. Usually the key of a key-value pair.")
        }).describe("Description of the tag group. For example, when you are buying electronics, examples of tag groups are Technical Specifications, General Information, Instruction Manual, etc"),
        list: z.array(TagSchema)
      }).describe("Describes a group of key, value pairs")

      const ItemSchema = z.object({
        descriptor: z.object({
          name: z.string().describe("The name of the product or service being purchased by the user")
        }).describe("A product or a service that the consumer wants to buy or avail. In the mobility sector, it can represent a fare product like one way journey. In the logistics sector, it can represent the delivery service offering. In the retail domain it can represent a product like a grocery item."),
        tags: z.array(TagGroupSchema)
      })

      const StopSchema = z.object({
        type: z.enum(['check-in', 'check-out', 'pick-up', 'drop', 'charging-start', 'charging-end']).describe("Standardized code describing a specific stage of fulfillment"),
        location: z.object({
          gps: z.string("The gps coordinate in the form x,y where x and y are both decimal numbers").optional(),
          address: z.string("The address of a location").optional()
        }).describe("Describes a location in physical or virtual space in its most abstract form. It could be a GPS, address, area_code, country, city, a 3D space, a path or even an IP address etc").optional(),
        time: z.object({
          timestamp: z.string().describe("A fixed date or time where an fulfillment event can happen. Examples: Check-in date, Check-out date, Pickup time, Drop time, Start time, end time etc. Format in RFC3339 date-time format or date format").optional(),
        }).describe("Time in its most abstract form. It can be a timestamp, a duration, a schedule, a range etc").optional()
      })

      const IntentSchema = z.object({
        item: ItemSchema,
        fulfillment: z.object({
          stops: z.array(StopSchema).describe("Details about the various stages in the fulfillment that the request has. For example, check-in date, check-in location, check-out date, check-out location, pick up location, delivery location").optional()
        }).describe("Describes how a an booking will be rendered/fulfilled to the end-customer. For example, in retail, this object contains the mode of fulfillment, where the delivery starts and ends. In hospitality, it contains the check-in and check-out dates.").optional()
      })

      const MessageSchema = z.object({
        intent: z.object({
          item: z.object({
            descriptor: z.object({
              name: z.string("The name of the item that needs to be purchased").optional()
            })
          }).describe("Detailed description of the item that needs to be discovered").optional(),
          fulfillment: z.object({
            stops: z.array(StopSchema).describe("The various stage or stops involved in the fulfillment of an order or a bookin. For example, in hospitality, it contains information about check-in and check-out. In retail, it contains details about pickup and drop locations. In EV-Charging, it contains details about the place and time of charding").optional()
          }).describe("Detailed information regarding the delivery/fulfillment of the product or service. Contains location information, time information, agent information, customer information").optional()
        })
      }).describe("The message body")
      
      let action_response = {
          status: false,
          data: null,
          message: null
      }        

      let openai_messages = [
          { "role": "user", "content": instruction }
      ]
      
      try{
          const Message = await this.instructorClient.chat.completions.create({
              messages: openai_messages,
              model: process.env.OPENAI_MODEL_ID,
              response_model: {
                schema: MessageSchema,
                name: "Message"
              }
          })

          logger.info(JSON.stringify(Message));

          action_response = {...Message}
      }
      catch(e){
          logger.error(e);
          action_response = {...action_response, message: e.message}
      }
      
      
      return action_response;
    }
    
    async get_beckn_message_from_text(instruction, context=[], domain='') {
        let domain_context = [], policy_context = [];
        if(domain_context && domain_context!='') {
            domain_context = [
                { role: 'system', content: `Domain : ${domain}`}
            ]
            if(registry_config[0].policies.domains[domain]){
                policy_context = [
                    { role: 'system', content: `Use the following policy : ${JSON.stringify(registry_config[0].policies)}` }
                ]
            }
        }
            
        const messages = [
            ...policy_context,
            ...domain_context,
            { role: "system", content: "Context goes here..."},
            ...context,
            { role: "user", content: instruction }

        ];
    
        const tools = [
            {
                type: "function",
                function: {
                    name: "get_search_intent",
                    description: "Get the correct search object based on user inputs", 
                    parameters: search
                }
            }
        ];
    
        try{
            // Assuming you have a function to abstract the API call
            const response = await openai.chat.completions.create({
                model: 'gpt-4-0125-preview',
                messages: messages,
                tools: tools,
                tool_choice: "auto", // auto is default, but we'll be explicit
            });
            const responseMessage = JSON.parse(response.choices[0].message?.tool_calls[0]?.function?.arguments) || null;
            logger.info(`Got beckn message from instruction : ${JSON.stringify(responseMessage)}`);
            return responseMessage
        }
        catch(e){
            logger.error(e);
            return null;
        }        
    }
    
    async compress_search_results(search_res){

        const desired_output = {
            "providers": [
                {
                    "id": "some_provider_id",
                    "name": "some_provider_name",
                    "bpp_id": "some_bpp_id",
                    "bpp_uri": "some_bpp_uri",
                    "items": [
                        {
                            "id": "some_item_id",
                            "name": "some_item_name"
                        }
                    ]
                }
            ]
        }
        let openai_messages = [
            { "role" : "system", "content": `Your job is to complress the search results received from user into the following JSON structure : ${JSON.stringify(desired_output)}`},
            { "role" : "system", "content": "bpp_id and bpp_uri for a provide must be picked up from its own context only." },
            { "role" : "system", "content": "you should not use responses or providers that do not have items." },
            { "role": "user", "content": JSON.stringify(search_res)}
        ]
        const completion = await openai.chat.completions.create({
            messages: openai_messages,
            model: process.env.OPENAI_MODEL_ID, // Using bigger model for search result compression
            response_format: { type: 'json_object' },
            temperature: 0,
        })
        const jsonString = completion.choices[0].message.content.trim()
        logger.info(jsonString)
        logger.info(`\u001b[1;34m ${JSON.stringify(completion.usage)}\u001b[0m`)
        
        const compressed = JSON.parse(jsonString)
        return {...search_res, responses: compressed};
    }
    
    
    async get_text_from_json(json_response, context=[], profile={}) {
        const desired_output = {
            status: true,
            message: "<Whastapp friendly formatted message>"
        };

        let call_to_action = {
            'search': 'You should ask which item the user wants to select to place the order. ',
            'select': 'You should ask if the user wants to initiate the order. You should not use any links from the response.',
            'init': 'You should ask if the user wants to confirm the order. ',
            'confirm': 'You should display the order id and show the succesful order confirmation message. You should ask if the user wants to book something else.',
        }

        if(!(profile.phone && profile.email && profile.name)){
            call_to_action.select+= 'Billing details are mandatory for initiating the order. You should ask the user to share billing details such as name, email and phone to iniatie the order.';
        }

        const openai_messages = [
            {role: 'system', content: `Your job is to analyse the input_json and provided chat history to convert the json response into a human readable, less verbose, whatsapp friendly message and return this in a json format as given below: \n ${JSON.stringify(desired_output)}. If the json is invalid or empty, the status in desired output should be false with the relevant error message.`},
            {role: 'system', content: `You should show search results in a listing format with important details mentioned such as name, price, rating, location, description or summary etc. and a call to action to select the item. `},
            {role: 'system', content: `Use this call to action : ${call_to_action[json_response?.context?.action] || ''}`},
            {role: 'system', content: `If the given json looks like an error, summarize the error but for humans, do not include any code or technical details. Produce some user friendly fun messages.`},
            {role: 'system', content: `User pforile : ${JSON.stringify(profile)}`},
            {role: 'system', content: `Chat history goes next ....`},
            ...context,
            {role: 'assistant',content: `input_json: ${JSON.stringify(json_response)}`},
        ]
        try {
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID, 
                temperature: 0,
                response_format: { type: 'json_object' },
            })
            let response = JSON.parse(completion.choices[0].message.content)            
            return response;
        } catch (e) {
            logger.error(e)
            return {
                status:false,
                message:e.message
            }
        }
       
    }

    async get_profile_from_text(message, profile={}){
        const desired_output = {
            "name": "",
            "email": "",
            "phone": "",
            "travel_source": "",
            "travel_destination": "",
            "current_location_gps": "",
            "vehicle-type":"",
            "connector-type": "",
            "pet-friendly_yn":0,
            "ev-charging-yn":0,
            "accomodation_type":"",
            "number_of_family_members":""
        }

        const openai_messages = [
            { role: 'system', content: `Please analyse the given user message and extract profile information about the user which is not already part of their profile. The desired outout format should be the following json ${JSON.stringify(desired_output)}` },
            { role: 'system', content: `You must not send any vague or incomplete information or anything that does not tell something about the user profile.` },
            { role: 'system', content: `Return empty json if no profile information extracted.` },
            { role: 'system', content: `Existing profile : ${JSON.stringify(profile)}`},
            { role: 'user', content: message }
        ]

        try {
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID, 
                temperature: 0,
                response_format: { type: 'json_object' },
            })
            let response = JSON.parse(completion.choices[0].message.content)            
            return {
                status: true,
                data: response
            };
        } catch (e) {
            logger.error(e)
            return {
                status:false,
                message:e.message
            }
        }
    }
}

export default AI;