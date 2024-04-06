export default {
    "SUPPORTED_ACTIONS": [
        { "action": "search", "description": "Perform a search for a service or product. If a service or product is not specified, its not a search. Listing all bookings is not a search." },
        { "action": "select", "description": "If the user likes or selects any item, this action should be used." },
        { "action": "init", "description": "If the user wants to place an order after search and select and has shared the billing details." },
        { "action": "confirm", "description": "Confirm an order. This action gets called when users confirms an order." },
        { "action": "clear_chat", "description": "If the user wants to clear the session or restart session or chat." },
        { "action": "clear_all", "description": "If the user wants to clear the complete session or the profile." }
    ],
    "SCHEMA_TRANSLATION_CONTEXT": [
        { "role": "system", "content": "Your job is to identify the endpoint, method and request body from the given schema, based on the last user input and return the extracted details in the following JSON structure : \n\n {'url':'', 'method':'', 'body':''}'"},
        { "role": "system", "content": "A typical order flow should be search > select > init > confirm."},
        { "role": "system", "content": "Use the response of search from assistant to select items from the list of items provided by the assistant."},
        { "role": "system", "content": "Use the response of search request from assistant for filling transaction_id, bpp_id, bpp_uri in the context of all calls except `search`."},
        { "role": "system", "content": "For `select`, `init`, `confirm`, you must use the item `id` as part of the payload for selected item instead of name or any other key."},
        { "role": "system", "content": "For hotel booking, there should be two fulfilment stoprs, one for check-in and one for check-out."},
        { "role": "system", "content": "For search actions, you should check the network policy for supported tags and use them based on user preferences to prepare the search payload."}
    ],
    "DOMAIN_TRANSLATION_CONTEXT": {
        "hospitality": [
            { "role": "system", "content" : "For hospitality domain, in search intent, item.descriptor.name should not be used."},
            { "role": "system", "content": "Some examples of searches are as following: "},
            { "role": "system", "content": `Example 1 (search by fulfilment) : ${JSON.stringify(
                {
                    "context": {
                        "domain": "{{hospitality}}",
                        "action": "search",
                        "version": "1.1.0",
                        "timestamp": "2023-10-09T04:46:28.012Z",
                        "bap_uri": "{{bap_uri}}",
                        "bap_id": "{{bap_id}}",
                        "bpp_id": "{{bpp_id_hotel}}",
                        "bpp_uri": "{{bpp_uri_hotel}}"
                    },
                    "message": {
                        "intent": {
                            "fulfillment": {
                                "stops": [
                                    {
                                        "type": "check-in",
                                        "location": {
                                            "gps": "48.9762,-117.7012"
                                        },
                                        "time": {
                                            "timestamp": "2024-04-03T08:53:56.438Z"
                                        }
                                    },
                                    {
                                        "type": "check-out",
                                        "location": {
                                            "gps": "48.9762,-117.7012"
                                        },
                                        "time": {
                                            "timestamp": "2024-04-03T08:53:56.438Z"
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
                )}`
            },
            { "role": "system", "content": `Example 2 (search by tags) : ${JSON.stringify(
                {
                    "context": {
                        "domain": "{{hospitality}}",
                        "location": {
                            "city": {
                                "name": "Bangalore",
                                "code": "std:080"
                            },
                            "country": {
                                "name": "India",
                                "code": "IND"
                            }
                        },
                        "action": "search",
                        "version": "1.1.0",
                        "timestamp": "2023-10-09T04:46:28.012Z",
                        "bap_uri": "{{bap_uri}}",
                        "bap_id": "{{bap_id}}",
                        "bpp_id": "{{bpp_id_hotel}}",
                        "bpp_uri": "{{bpp_uri_hotel}}"
                    },
                    "message": {
                        "intent": {
                            "item": {
                                "tags": [
                                    {
                                        "list": [
                                            {
                                                "descriptor": {
                                                    "code": "pet-friendly"
                                                },
                                                "value": "yes"
                                            },
                                            {
                                                "descriptor": {
                                                    "code": "ev-charging"
                                                },
                                                "value": "yes"
                                            },
                                            {
                                                "descriptor": {
                                                    "code": "accomodation-type"
                                                },
                                                "value": "campsite"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
                )}`
            }
        ]
    }
}