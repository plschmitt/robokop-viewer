import logging
import time
from setup import app, mail
from celery import Celery
from flask_mail import Message
from question import get_question_by_id
from flask_security.core import current_user

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', '..', 'robokop-interfaces'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', '..', 'robokop-build','builder'))
import userquery
from greent.rosetta import Rosetta
from builder import KnowledgeGraph, generate_name_node, lookup_identifier
from greent.graph_components import KNode
from lookup_utils import lookup_disease_by_name, lookup_drug_by_name, lookup_phenotype_by_name
from userquery import UserQuery

# set up Celery
app.config['CELERY_BROKER_URL'] = 'redis://localhost:6379/0'
app.config['CELERY_RESULT_BACKEND'] = 'redis://localhost:6379/0'
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

# set up logger
logger = logging.getLogger("robokop")

@celery.task
def wait_and_email():
    logger.info("Waiting to email...")
    time.sleep(20)
    with app.app_context():
        msg = Message("ROBOKOP: Test",
                      sender="robokop@sandboxa74aec7033c545a6aa4e43bdf8271f0b.mailgun.org",
                      recipients=["patrick@covar.com"],
                      body="I'm in a subprocess.")
        mail.send(msg)

@celery.task
def answer_question(question_id):
    logger.info("Answering your question...")

    question = get_question_by_id(question_id)
    question.answer()
    user = question.user
    
    with app.app_context():
        msg = Message("ROBOKOP: Answers Ready",
                      sender="robokop@sandboxa74aec7033c545a6aa4e43bdf8271f0b.mailgun.org",
                      recipients=['patrick@covar.com'], #[user.email],
                      body="Your question answers are ready. <link>")
        mail.send(msg)

    logger.info("Done answering.")

@celery.task
def update_kg(question_id):
    logger.info("Updating the knowledge graph...")

    question = get_question_by_id(question_id)
    
    # initialize rosetta
    rosetta = Rosetta()
        
    try:
        # convert query to the required form
        query = questionToRenciQuery(question, rosetta)

        # build knowledge graph
        kgraph = KnowledgeGraph(query, rosetta)

        # # get construction/source graph
        # sgraph = getSourceGraph(kgraph)
        # print(sgraph)

        # export graph to Neo4j
        supports = ['chemotext']
        # supports = ['chemotext', 'chemotext2'] # chemotext2 is really slow
        exportBioGraph(kgraph, "q_"+question.hash, supports=supports)
        
    # send completion email
    with app.app_context():
        msg = Message("ROBOKOP: Knowledge Graph Update Complete",
                      sender="robokop@sandboxa74aec7033c545a6aa4e43bdf8271f0b.mailgun.org",
                      recipients=['patrick@covar.com'], #[user.email],
                      body="The knowledge graph has been updated with respect to your question. <link>")
        mail.send(msg)

    logger.info("Done updating.")

    except:
        logger.exception("Exception while updating KG.")


def questionToRenciQuery(question, rosetta):
    if not question.nodes[0]['nodeSpecType'] == 'Named Node':
        raise TypeError('First node should be named.')
    two_sided = question.nodes[-1]['nodeSpecType'] == 'Named Node'

    start_name = question.nodes[0]['label']
    start_type = question.nodes[1]['type']
    start_identifiers = lookup_identifier(start_name, start_type, rosetta.core)
    start_node = generate_name_node(start_name, start_type)

    if two_sided:
        end_name = question.nodes[-1]['label']
        end_type = question.nodes[-2]['type']
        end_identifiers = lookup_identifier(end_name, end_type, rosetta.core)
        end_node = generate_name_node(end_name, end_type)

    query = UserQuery(start_identifiers, start_type, start_node)
    if two_sided:
        middlybits = question.edges[1:-2]
    else:
        middlybits = question.edges[1:]
    for e in middlybits:
        query.add_transition(question.nodes[e['end']]['type'].replace(' ', ''),\
            min_path_length=e['length'][0],\
            max_path_length=e['length'][0])
    if two_sided:
        end_type = question.nodes[-2]['type']
        query.add_transition(end_type, end_values=end_identifiers)
        query.add_end_lookup_node(end_node)
    return query


def getSourceGraph(kgraph):
    # quickly grab the knowledge source graph
    cyphers = kgraph.userquery.generate_cypher()
    construction_graph = []
    for cypher in cyphers:
        programs = kgraph.rosetta.type_graph.db.query(cypher, data_contents=True)
        # programs = kgraph.rosetta.type_graph.get_transitions(cypher)
        # chain = programs[0]
        nodes = []
        edges = []
        for program in programs.rows:
            for chain in program:
            # chain looks something like this:
                """[{'name': 'Disease'},
                    {'op': 'pharos.disease_get_gene', 'predicate': 'DISEASE_GENE', 'enabled': True},
                    {'name': 'Gene'},
                    {'op': ...},
                    ...]"""

            nodes += [{'id':n['name'],
                    'name':n['name']} for n in chain[::2]]
            edges += [{'from':chain[i*2]['name'],
                'to':chain[i*2+2]['name'],
                'reference':e['op'].split('.')[0],
                'function':e['op'].split('.')[1],
                'type':e['predicate'],
                'id':e['op'],
                'publications':''} for i, e in enumerate(chain[1::2])]

        # unique nodes
        nodes = {n['id']:n for n in nodes}
        nodes = [nodes[k] for k in nodes]

        # unique edges
        edges = {e['id']:e for e in edges}
        edges = [edges[k] for k in edges]
        construction_graph += [{
            'nodes': nodes,
            'edges': edges
        }]
    def uniqueDictByField(d, k):
        return list({e[k]:e for e in d}.values())
    construction_graph = {
        'nodes': uniqueDictByField([n for g in construction_graph for n in g['nodes']], 'id'),
        'edges': uniqueDictByField([e for g in construction_graph for e in g['edges']], 'id')
    }
    return construction_graph

def exportBioGraph(kgraph, result_name, supports=[]):
    kgraph.execute()
    kgraph.print_types()
    kgraph.prune()
    kgraph.enhance()
    kgraph.support(supports)
    kgraph.export(result_name)