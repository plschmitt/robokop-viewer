'''
Blueprint for /api/q/* endpoints
'''

import os
import sys
import re
from datetime import datetime
import requests
from flask import jsonify, request
from flask_security import auth_required
from flask_security.core import current_user
from flask_restplus import Resource

from question import get_question_by_id
from answer import list_answersets_by_question_hash
from feedback import list_feedback_by_question
from tasks import answer_question, update_kg
from util import getAuthData, get_tasks
from setup import db, api
from logging_config import logger

@api.route('/q/<question_id>')
@api.param('question_id', 'A question id')
class QuestionAPI(Resource):
    @api.response(200, 'Success')
    @api.response(404, 'Invalid question key')
    def get(self, question_id):
        """Get question"""

        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404

        user = getAuthData()
        answerset_list = list_answersets_by_question_hash(question.hash)

        return {'user': user,
                'question': question.toJSON(),
                'owner': question.user.email,
                'answerset_list': [a.toJSON() for a in answerset_list]}, 200

    @auth_required('session', 'basic')
    @api.response(200, 'Question edited')
    @api.response(404, 'Invalid question key')
    def post(self, question_id):
        """Edit question metadata"""
        logger.info('Editing question %s', question_id)
        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404
        if not (current_user == question.user or current_user.has_role('admin')):
            return "UNAUTHORIZED", 401 # not authorized
        question.name = request.json['name']
        question.notes = request.json['notes']
        question.natural_question = request.json['natural_question']
        db.session.commit()
        return "SUCCESS", 200

    @auth_required('session', 'basic')
    @api.response(200, 'Question deleted')
    @api.response(401, 'Unauthorized')
    @api.response(404, 'Invalid question key')
    def delete(self, question_id):
        """Delete question"""
        logger.info('Deleting question %s', question_id)
        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404
        if not (current_user == question.user or current_user.has_role('admin')):
            return "UNAUTHORIZED", 401 # not authorized
        db.session.delete(question)
        db.session.commit()
        return "SUCCESS", 200

# get feedback by question
@api.route('/q/<question_id>/feedback')
class GetFeedbackByQuestion(Resource):
    @api.response(200, 'Success')
    @api.doc(params={
        'question_id': 'Question id'})
    def get(self, question_id):
        """Create new feedback"""
        try:
            question = get_question_by_id(question_id)
            feedback = list_feedback_by_question(question)
        except Exception as err:
            return "Invalid question id", 404

        return feedback.toJSON(), 200

@api.route('/q/<question_id>/answer')
@api.param('question_id', 'A question id')
class AnswerQuestion(Resource):
    @auth_required('session', 'basic')
    @api.response(202, 'Answering in progress')
    @api.response(404, 'Invalid question key')
    def post(self, question_id):
        """Answer question"""
        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404
        username = current_user.username
        # Answer a question
        task = answer_question.apply_async(args=[question.hash], kwargs={'question_id':question_id, 'user_email':username})
        return {'task_id':task.id}, 200

@api.route('/q/<question_id>/refresh_kg')
@api.param('question_id', 'A question id')
class RefreshKG(Resource):
    @auth_required('session', 'basic')
    @api.response(202, 'Refreshing in progress')
    @api.response(404, 'Invalid question key')
    def post(self, question_id):
        """Refresh KG for question"""
        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404
        question_hash = question.hash
        username = current_user.username
        # Update the knowledge graph for a question
        task = update_kg.apply_async(args=[question_hash], kwargs={'question_id':question_id, 'user_email':username})
        return {'task_id':task.id}, 202

@api.route('/q/<question_id>/tasks')
@api.param('question_id', 'A question id')
class QuestionTasks(Resource):
    @api.response(200, 'Success')
    @api.response(404, 'Invalid question key')
    def get(self, question_id):
        """Get list of queued tasks for question"""

        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404

        question_hash = question.hash

        tasks = list(get_tasks().values())

        # filter out tasks for other questions
        question_tasks = []
        for t in tasks:
            if not t['args']:
                continue
            match = re.match(r"\['(.*)'\]", t['args'])
            if match and match.group(1) == question_hash:
                question_tasks.append(t)

        # filter out the SUCCESS/FAILURE tasks
        question_tasks = [t for t in question_tasks if not (t['state'] == 'SUCCESS' or t['state'] == 'FAILURE' or t['state'] == 'REVOKED')]

        # split into answer and update tasks
        answerers = [t for t in question_tasks if t['name'] == 'tasks.answer_question']
        updaters = [t for t in question_tasks if t['name'] == 'tasks.update_kg']
        initializers = [t for t in question_tasks if t['name'] == 'tasks.initialize_question']

        return {'answerers': answerers,
                'updaters': updaters,
                'initializers': initializers}, 200

@api.route('/q/<question_id>/subgraph')
@api.param('question_id', 'A question id')
class QuestionSubgraph(Resource):
    @api.response(200, 'Success')
    @api.response(404, 'Invalid question key')
    def get(self, question_id):
        """Get question subgraph"""

        try:
            question = get_question_by_id(question_id)
        except Exception as err:
            return "Invalid question key.", 404
            
        subgraph = question.relevant_subgraph()

        return subgraph, 200