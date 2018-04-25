import React from 'react';
import PropTypes from 'prop-types';

import { Grid } from 'react-bootstrap';
import QuestionHeader from '../shared/QuestionHeader';
import AnswersetInteractive from './AnswersetInteractive';


class AnswersetPres extends React.Component {
  constructor(props) {
    super(props);

  }

  render() {
    return (
      <Grid>
        <QuestionHeader
          answerset={this.props.answerset}
          question={this.props.question}

          showOtherQuestions
          otherQuestions={this.props.otherQuestions}
          callbackQuestionSelect={this.props.callbackQuestionSelect}
          showOtherAnswersets
          otherAnswersets={this.props.otherAnswersets}
          callbackAnswersetSelect={this.props.callbackAnswersetSelect}
        />
        <br />
        <AnswersetInteractive
          answers={this.props.answers}
          callbackAnswer={this.props.callbackAnswerSelect}
        />
      </Grid>
    );
  }
};

AnswersetPres.propTypes = {
  callbackAnswersetSelect: PropTypes.func.isRequired,
  callbackQuestionSelect: PropTypes.func.isRequired,
  callbackAnswerSelect: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
  otherQuestions: PropTypes.arrayOf(PropTypes.object).isRequired,
  answerset: PropTypes.object.isRequired,
  otherAnswersets: PropTypes.arrayOf(PropTypes.object).isRequired,
  answers: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default AnswersetPres;