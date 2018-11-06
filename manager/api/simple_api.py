'''
Blueprint for /api/simple/* endpoints
'''

import os
import sys
import json
import time
import re
import logging
from datetime import datetime
import requests
from flask import jsonify, request
from flask_security import auth_required
from flask_security.core import current_user
from flask_restful import Resource

from manager.setup import api

logger = logging.getLogger(__name__)

class Expand(Resource):
    def get(self, type1, id1, type2):
        """
        Expand out from a given node to another node type optionally along a particular predicate
        ---
        tags: [simple]
        parameters:
          - in: path
            name: type1
            description: "type of first node"
            schema:
                type: string
            required: true
            default: "disease"
          - in: path
            name: id1
            description: "curie of first node"
            schema:
                type: string
            required: true
            default: "MONDO:0005737"
          - in: path
            name: type2
            description: "type of second node"
            schema:
                type: string
            required: true
            default: "gene"
          - in: query
            name: predicate
            schema:
                type: string
            default: "disease_to_gene_association"
          - in: query
            name: csv
            schema:
                type: boolean
            default: false
          - in: query
            name: rebuild
            schema:
                type: boolean
            default: false
        responses:
            200:
                description: answers
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                answers:
                                    type: array
                                    items:
                                        $ref: '#/definitions/Answer'
        """
        question = {
            'machine_question': {
                'nodes': [
                    {
                        'id': 'n0',
                        'curie': id1,
                        'type': type1
                    },
                    {
                        'id': 'n1',
                        'type': type2
                    }
                ],
                'edges': [
                    {
                        'id': 'e0',
                        'source_id': 'n0',
                        'target_id': 'n1'
                    }
                ]
            }
        }
        logger.info('expand')
        predicate = request.args.get('predicate')
        if predicate is not None:
            question['machine_question']['edges'][0]['type'] = predicate
        csv = request.args.get('csv', default='false')
        question['rebuild'] = request.args.get('rebuild', default='false')
        response = requests.post(
            f'http://manager:{os.environ["MANAGER_PORT"]}/api/simple/quick/?max_results=-1',
            json=question)
        answerset = response.json()
        if csv.upper() == 'TRUE':
            node_names = [f"{a['nodes'][-1]['name']}({a['nodes'][-1]['id']})" if 'name' in a['nodes'][-1] else a['nodes'][-1]['id'] for a in answerset['answers']]
            return node_names
        return answerset

api.add_resource(Expand, '/simple/expand/<type1>/<id1>/<type2>')

class Quick(Resource):
    def post(self):
        """
        Get answers to a question without caching
        ---
        tags: [simple]
        requestBody:
            name: question
            description: The machine-readable question graph.
            content:
                application/json:
                    schema:
                        $ref: '#/definitions/Question'
            required: true
        parameters:
          - in: query
            name: max_results
            description: Maximum number of results to return. Provide -1 to indicate no maximum.
            schema:
                type: integer
            default: 250
        responses:
            200:
                description: Answer set
                content:
                    application/json:
                        schema:
                            $ref: '#/definitions/Response'
        """
        logger.info('quick')
        question = request.json
        logger.info("quack")
        if ('rebuild' in question) and (str(question['rebuild']).upper() == 'TRUE'):
            logger.info("rebuild")
            response = requests.post(
                f'http://{os.environ["BUILDER_HOST"]}:{os.environ["BUILDER_PORT"]}/api/',
                json=request.json)
            polling_url = f"http://{os.environ['BUILDER_HOST']}:{os.environ['BUILDER_PORT']}/api/task/{response.json()['task id']}"

            for _ in range(60 * 60):  # wait up to 1 hour
                time.sleep(1)
                response = requests.get(polling_url)
                if response.status_code == 200:
                    if response.json()['status'] == 'FAILURE':
                        raise RuntimeError('Builder failed.')
                    if response.json()['status'] == 'REVOKED':
                        raise RuntimeError('Task terminated by admin.')
                    if response.json()['status'] == 'SUCCESS':
                        break
            else:
                raise RuntimeError("Knowledge source querying has not completed after 1 hour. You may wish to try again later.")

            logger.info('Done updating KG. Answering question...')

        max_results = request.args.get('max_results')
        max_results = max_results if max_results is not None else 250
        response = requests.post(
            f'http://{os.environ["RANKER_HOST"]}:{os.environ["RANKER_PORT"]}/api/?max_results={max_results}',
            json=question)
        polling_url = f"http://{os.environ['RANKER_HOST']}:{os.environ['RANKER_PORT']}/api/task/{response.json()['task_id']}"

        for _ in range(60 * 60):  # wait up to 1 hour
            time.sleep(1)
            response = requests.get(polling_url)
            if response.status_code == 200:
                if response.json()['status'] == 'FAILURE':
                    raise RuntimeError('Question answering failed.')
                if response.json()['status'] == 'REVOKED':
                    raise RuntimeError('Task terminated by admin.')
                if response.json()['status'] == 'SUCCESS':
                    break
        else:
            raise RuntimeError("Question answering has not completed after 1 hour. You may with to try the non-blocking API.")

        answerset_json = requests.get(f"http://{os.environ['RANKER_HOST']}:{os.environ['RANKER_PORT']}/api/result/{response.json()['task_id']}")
        return answerset_json.json()

api.add_resource(Quick, '/simple/quick/')

class SimilaritySearch(Resource):
    def get(self, type1, id1, type2, by_type):
        """
        Expand out from a given node to another node type optionally along a particular predicate
        ---
        tags: [simple]
        parameters:
          - in: path
            name: type1
            description: "type of query node"
            schema:
                type: string
            required: true
            default: "disease"
          - in: path
            name: id1
            description: "curie of query node"
            schema:
                type: string
            required: true
            default: "MONDO:0005737"
          - in: path
            name: type2
            description: "type of return nodes"
            schema:
                type: string
            required: true
            default: "disease"
          - in: path
            name: by_type
            description: "type used to evaluate similarity"
            schema:
                type: string
            required: true
            default: "phenotypic_feature"
          - in: query
            name: threshhold
            description: "Number between 0 and 1 indicating the minimum similarity to return"
            schema:
                type: float
            default: 0.5
          - in: query
            name: maxresults
            description: "The maximum number of results to return. Set to 0 to return all results."
            schema:
                type: integer
            default: 100
          - in: query
            name: csv
            schema:
                type: boolean
            default: true
          - in: query
            name: rebuild
            description: "Rebuild local knowledge graph for this similarity search"
            schema:
                type: boolean
            default: false
        responses:
            200:
                description: answers
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                answers:
                                    type: array
                                    items:
                                        $ref: '#/definitions/Answer'
        """
        #TODO:Add another argument:
        #- in: query
        #  name: descendants
        #  description: "Include ontological descendants in the result"
        #  type: boolean
        #  default: false
        response = requests.post( f'http://{os.environ["BUILDER_HOST"]}:{os.environ["BUILDER_PORT"]}/api/synonymize/{id1}/{type1}/' )
        sid1 = response.json()['id']
        rebuild = request.args.get('rebuild', default = 'False')
        if rebuild.upper()=='TRUE':
            try:
                question = {
                    'machine_question': {
                        'nodes': [
                            {
                                'id': 'n0',
                                'curie': sid1,
                                'type': type1
                            },
                            {
                                'id': 'n1',
                                'type': by_type
                            },
                            {
                                'id': 'n2',
                                'type': type2
                            },
                            {
                                'id': 'n3',
                                'type': by_type
                            }
                        ],
                        'edges': [
                            {
                                'source_id': 'n0',
                                'target_id': 'n1'
                            },
                            {
                                'source_id': 'n1',
                                'target_id': 'n2'
                            },
                            {
                                'source_id': 'n2',
                                'target_id': 'n3'
                            },
                        ]
                    }
                }
                response = requests.post( f'http://{os.environ["BUILDER_HOST"]}:{os.environ["BUILDER_PORT"]}/api/', json=question)
                polling_url = f"http://{os.environ['BUILDER_HOST']}:{os.environ['BUILDER_PORT']}/api/task/{response.json()['task id']}"

                for _ in range(60 * 60):  # wait up to 1 hour
                    time.sleep(1)
                    response = requests.get(polling_url)
                    if response.status_code == 200:
                        if response.json()['status'] == 'FAILURE':
                            raise RuntimeError('Builder failed.')
                        if response.json()['status'] == 'REVOKED':
                            raise RuntimeError('Task terminated by admin.')
                        if response.json()['status'] == 'SUCCESS':
                            break
                else:
                    raise RuntimeError("Knowledge source querying has not completed after 1 hour. You may wish to try again later.")

                logger.info('Rebuild completed, status', response.json()['status'])
            except Exception as e:
                logger.error(e)
        else:
            logger.info("No rebuild")

        #Now we're ready to calculate sim

        sim_params = {'threshhold':request.args.get('threshhold', default = None),
                      'maxresults':request.args.get('maxresults', default = None)}
        sim_params = {k:v for k,v in sim_params.items() if v is not None}
        response = requests.get( f'http://{os.environ["RANKER_HOST"]}:{os.environ["RANKER_PORT"]}/api/similarity/{type1}/{sid1}/{type2}/{by_type}', params=sim_params)

        return response.json()

api.add_resource(SimilaritySearch, '/simple/similarity/<type1>/<id1>/<type2>/<by_type>')

class EnrichedExpansion(Resource):
    def post(self, type1, type2 ):
        """
        Expand out from a given node to another node type optionally along a particular predicate
        ---
        tags: [simple]
        parameters:
          - in: path
            name: type1
            description: "type of query node"
            schema:
                type: string
            required: true
            default: "disease"
          - in: path
            name: type2
            description: "type of return nodes"
            schema:
                type: string
            required: true
            default: "disease"
        requestBody:
            name: all_the_things
            description: "This should probably be a schema object"
            content:
                application/json:
                    schema:
                        type: object
                        properties:
                            threshhold:
                                description: "Number between 0 and 1 indicating the minimum similarity to return"
                                type: number
                                default: 0.5
                            maxresults:
                                description: "The maximum number of results to return. Set to 0 to return all results."
                                type: integer
                                default: 100
                            identifiers:
                                description: "The entities being enriched"
                                type: array
                                items:
                                    type: string
                                required: true
                            include_descendants:
                                description: "Extend the starting entities to use all of their descendants as well"
                                type: boolean
                                default: false
                            numtype1:
                                type: integer
                                description: "The total number of entities of type 1 that exist. By default uses a value based on querying the cache"
                            rebuild:
                                description: "Rebuild local knowledge graph for this similarity search"
                                type: boolean
                                default: false
                        example:
                            threshhold: 0.5
                            maxresults: 100
                            identifiers: ["MONDO:0014683", "MONDO:0005737"]
                            include_descendants: false
                            rebuild: false
        responses:
            200:
                description: answers
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                answers:
                                    type: array
                                    items:
                                        $ref: '#/definitions/Answer'
        """
        parameters = request.json
        identifiers = parameters['identifiers']
        normed_identifiers = set()
        for id1 in identifiers:
            response = requests.post( f'http://{os.environ["BUILDER_HOST"]}:{os.environ["BUILDER_PORT"]}/api/synonymize/{id1}/{type1}/' )
            normed_identifiers.add(response.json()['id'])
        if 'include_descendants' in parameters and parameters['include_descendants']:
            self.add_descendants(normed_identifiers)
        if 'rebuild' in parameters and parameters['rebuild']:
            for normed_id in normed_identifiers:
                try:
                    question = {
                        'machine_question': {
                            'nodes': [
                                {
                                    'id': 'n0',
                                    'curie': normed_id,
                                    'type': type1
                                },
                                {
                                    'id': 'n1',
                                    'type': type2
                                },
                                {
                                    'id': 'n2',
                                    'type': type1
                                }
                            ],
                            'edges': [
                                {
                                    'source_id': 'n0',
                                    'target_id': 'n1'
                                },
                                {
                                    'source_id': 'n1',
                                    'target_id': 'n2'
                                }
                            ]
                        }
                    }
                    response = requests.post( f'http://{os.environ["BUILDER_HOST"]}:{os.environ["BUILDER_PORT"]}/api/', json=question)
                    polling_url = f"http://{os.environ['BUILDER_HOST']}:{os.environ['BUILDER_PORT']}/api/task/{response.json()['task id']}"

                    for _ in range(60 * 60):  # wait up to 1 hour
                        time.sleep(1)
                        response = requests.get(polling_url)
                        if response.status_code == 200:
                            if response.json()['status'] == 'FAILURE':
                                raise RuntimeError('Builder failed.')
                            if response.json()['status'] == 'REVOKED':
                                raise RuntimeError('Task terminated by admin.')
                            if response.json()['status'] == 'SUCCESS':
                                break
                    else:
                        raise RuntimeError("Knowledge source querying has not completed after 1 hour. You may wish to try again later.")

                    logger.info('Rebuild completed, status', response.json()['status'])
                except Exception as e:
                    logger.error(e)
            else:
                logger.info("No rebuild")

        #Now we've updated the knowledge graph if demanded.  We can do the enrichment.
        if 'threshhold' in parameters:
            threshhold = parameters['threshhold']
        else:
            threshhold = 0.05
        if 'maxresults' in parameters:
            maxresults = parameters['maxresults']
        else:
            maxresults = 100
        if 'num_type1' in parameters:
            num_type1 = parameters['num_type1']
        else:
            num_type1 = None
        params = {'identifiers':list(normed_identifiers),
                  'threshhold':threshhold,
                  'maxresults':maxresults,
                  'num_type1':num_type1}
        response = requests.post( f'http://{os.environ["RANKER_HOST"]}:{os.environ["RANKER_PORT"]}/api/enrichment/{type1}/{type2}',json=params)
        return response.json()

    def add_descendants(self,identifiers):
        descendants = set()
        for ident in identifiers:
            response = requests.get( f'https://onto.renci.org/descendants/{ident}' ).json()
            descendants.update(response['descendants'])
        identifiers.update(descendants)

api.add_resource(EnrichedExpansion, '/simple/enriched/<type1>/<type2>')
