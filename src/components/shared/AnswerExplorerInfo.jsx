import React from 'react';

import { Row, Col, Panel, Collapse } from 'react-bootstrap';

import FaDownload from 'react-icons/lib/fa/download';

import AppConfig from '../../AppConfig';
import { config } from '../../index';

import SubGraphViewer from './SubGraphViewer';
import PubmedList from './PubmedList';

import curieUrls from '../util/curieUrls';

const shortid = require('shortid');

import edgeStats from './../util/edgeStatistics';

class AnswerExplorerInfo extends React.Component {
  constructor(props) {
    super(props);

    this.appConfig = new AppConfig(config);

    this.state = {
      selectedEdge: {},
      selectedEdgeId: null,
      selectedNodeId: null,
      subgraph: { nodes: [], edges: [] },
      disbleGraphClick: false,
      downloadingPubs: false,
      componentOpened : {
        'cTable' : true,
      },
      ctngcyTableRoundTo : 2,
    };

    this.onGraphClick = this.onGraphClick.bind(this);
  }

  componentDidMount() {
    this.syncPropsAndState(this.props);
  }

  syncPropsAndState(newProps) {
    const { graph, selectedEdge } = newProps;
    const nodes = graph.node_list.filter(n => ((n.id === selectedEdge.source_id) || (n.id === selectedEdge.target_id)));
    const nodeIds = nodes.map(n => n.id);
    const edges = graph.edge_list.filter(e => (nodeIds.includes(e.source_id) && nodeIds.includes(e.target_id)));

    const subgraph = { nodes, edges };
    this.setState({
      subgraph, selectedEdgeId: selectedEdge.edgeIdFromKG, selectedNodeId: null, selectedEdge,
    }, () => {
      this.getPublicationsFrag();
    });

    if (edges.length === 1) {
      this.setState({ disbleGraphClick: true });
    }
  }

  onGraphClick(event) {
    if (this.state.disbleGraphClick) {
      return;
    }

    const newState = { selectedEdgeId: null, selectedNodeId: null, selectedEdge: {} };
    if (event.edges.length !== 0) { // Clicked on an Edge
      newState.selectedEdgeId = event.edgeObjects[0].edgeIdFromKG;
      newState.selectedEdge = event.edgeObjects[0];
    } else if (event.nodes.length !== 0) { // Clicked on a node
      newState.selectedNodeId = event.nodes[0];
    }
    this.setState(newState);
  }

  getNodeInfoFrag(n) {
    if (!n || !('name' in n)) {
      return (<div />);
    }

    const urls = curieUrls(n.id);
    return (
      <Panel>
        <Panel.Heading>
          <Panel.Title componentClass="h3">
            {n.name}
          </Panel.Title>
        </Panel.Heading>
        <Panel.Body style={{ minHeight: '100px' }}>
          <h5>
            {n.type}
          </h5>
          <h5>
            {n.id}
          </h5>
          {
            urls.map(link => <span key={shortid.generate()}><a href={link.url} target="_blank">{link.label}</a> &nbsp; </span>)
          }
        </Panel.Body>
      </Panel>
    );
  }

  getEdgeInfoFrag(edge) {
    if (!edge) {
      return (<div />);
    }
    let origin = 'Unknown';
    const sourceToOriginString = source => source; // source.substr(0, source.indexOf('.'));

    if ('source_database' in edge) {
      if (Array.isArray(edge.source_database) && edge.source_database.length > 0) {
        origin = edge.source_database.map(source => <span key={shortid.generate()}>{sourceToOriginString(source)} &nbsp; </span>);
      } else {
        origin = sourceToOriginString(edge.source_database);
      }
    }
    return (
      <Panel>
        <Panel.Heading>
          <Panel.Title componentClass="h3">
            {edge.type}
          </Panel.Title>
        </Panel.Heading>
        <Panel.Body style={{ minHeight: '100px' }}>
          <h5>
            Established using:
            <p>
              {origin}
            </p>
          </h5>
        </Panel.Body>
      </Panel>
    );
  }

  getPublicationsFrag() {
    let publicationListFrag = <div><p>Click on edge above to see a list of publications.</p></div>;
    let publicationsTitle = 'Publications';

    let publications = [];
    if (this.state.selectedEdgeId !== null) {
      // Edge is selected
      let edge = this.state.subgraph.edges.find(e => e.id === this.state.selectedEdgeId);
      if (typeof edge === 'undefined') {
        edge = this.state.subgraph.edges.find(e => e.edgeIdFromKG === this.state.selectedEdgeId);
      }
      if (typeof edge === 'undefined') {
        console.log('Couldn\'t find this edge', this.state.selectedEdgeId, this.state.subgraph.edges);
        return (
          <div>
            <h4 style={{ marginTop: '15px' }}>
              An error was encountered fetching publication information.
            </h4>
          </div>
        );
      }

      const sourceNode = this.state.subgraph.nodes.find(n => n.id === edge.source_id);
      const targetNode = this.state.subgraph.nodes.find(n => n.id === edge.target_id);
      if ('publications' in edge && Array.isArray(edge.publications)) {
        ({ publications } = edge);
      }
      publicationsTitle = `${publications.length} Publications for ${sourceNode.name} and ${targetNode.name}`;
      publicationListFrag = <PubmedList publications={publications} />;
    } else if (this.state.selectedNodeId) {
      // Node is selected
      const node = this.state.subgraph.nodes.find(n => n.id === this.state.selectedNodeId);
      if ('publications' in node && Array.isArray(node.publications)) {
        ({ publications } = node);
      }
      publicationsTitle = `${publications.length} Publications for ${node.name}`;
      publicationListFrag = <PubmedList publications={publications} />;
    }

    const downloadCallback = () => this.setState({ downloadingPubs: true }, () => this.downloadPublicationsInfo(publications));
    const showDownload = publications.length >= 1;

    const cursor = this.state.downloadingPubs ? 'progress' : 'pointer';
    const activeCallback = this.state.downloadingPubs ? () => { } : downloadCallback;
    const downloadTitle = this.state.downloadingPubs ? 'Downloading Please Wait' : 'Download Publications';
    const downloadColor = this.state.downloadingPubs ? '#333' : '#000';
    return (
      <Panel style={{ marginTop: '15px' }}>
        <Panel.Heading>
          <Panel.Title componentClass="h3">
            {publicationsTitle}
            <div className="pull-right">
              <div style={{ position: 'relative' }}>
                {showDownload &&
                  <div style={{ position: 'absolute', top: -3, right: -8 }}>
                    <span style={{ fontSize: '22px', color: downloadColor }} title={downloadTitle}>
                      <FaDownload onClick={activeCallback} style={{ cursor }} />
                    </span>
                  </div>
                }
              </div>
            </div>
          </Panel.Title>
        </Panel.Heading>
        <Panel.Body style={{ padding: 0 }}>
          {publicationListFrag}
        </Panel.Body>
      </Panel>
    );
  }

  renderContingencyTableCell(cell) {
    //I assume here that null values are to be rendered as 0
    var column = cell.column_percentage,
        row = cell.row_percentage,
        total = cell.total_percentage,
        freq = cell.frequency,
        roundTo = this.state.ctngcyTableRoundTo;
    /*
    frequency             row_percentage
    column_percentage     total_percentage
    */
    var c1 = [], c2 = [];
    c1.push(<td>{freq}</td>);
    if (row != -1) { c1.push(<td>{this.formatTable(row*100) + "%"}</td>); }
    if (column != -1) { c2.push(<td>{this.formatTable(column*100) + "%"}</td>); }
    if (total != -1) { c2.push(<td>{this.formatTable(total*100) + "%"}</td>); }

    return (
      <div>
        <table className="ctngcyCellInner">
          <tr>
            {c1}
          </tr>
          <tr>
            {c2}
          </tr>
        </table>
      </div>
    );
  }
  addContingencyCell(cell1, cell2) {
    if (cell1 && cell2) {
      var newCell  = {
        frequency: cell1.frequency+cell2.frequency,
        row_percentage: cell1.row_percentage+cell2.row_percentage,
        column_percentage: cell1.column_percentage+cell2.column_percentage,
        total_percentage: cell1.total_percentage+cell2.total_percentage,
      };
      return newCell;
    }
  }
  blankContingencyCell() {
    var newCell = {
      frequency: 0,
      row_percentage: 0,
      column_percentage: 0,
      total_percentage: 0,
    };
    return newCell;
  }

  renderContingencyTable() {
    var matrixRender = null;
    if (this.state.selectedEdge && this.state.selectedEdge.edge_attributes) {
      matrixRender = [];
      var attr = this.state.selectedEdge.edge_attributes;
      var matrix = attr.feature_matrix;
      var columnHeaders = attr.feature_a;
      var rowHeaders = attr.feature_b;

      var headerRow = [];
      //blank space in top left
      headerRow.push(<th>{""}</th>);
      for (var i = 0; i < columnHeaders.feature_qualifiers.length; i++) {
        var q = columnHeaders.feature_qualifiers[i];
        var operator = q.operator.replace(">=","≥").replace("<=","≤");
        var headerStr = columnHeaders.feature_name + " " + operator + " " + q.value;
        headerRow.push(<th className="ctngcyColumnHeader">{headerStr}</th>);
      }
      matrixRender.push(<tr>{headerRow}</tr>);

      var columnTotals = [];
      var rowTotals = [];
      var tableTotal = this.blankContingencyCell();

      var postHeaderRows = [];
      for (var k = 0; k < matrix.length; k++) {
        //traversing rows
        postHeaderRows.push([]);

        var q = rowHeaders.feature_qualifiers[k];
        var operator = q.operator.replace(">=","≥").replace("<=","≤");
        var headerStr = rowHeaders.feature_name + " " + operator + " " + q.value; 
        postHeaderRows[k].push(<th className="ctngcyRowHeader">{headerStr}</th>);

        rowTotals.push(this.blankContingencyCell());
        for (var l = 0; l < matrix[k].length; l++) {
          //traversing columns in row k
          var cell = matrix[k][l];
          rowTotals[k] = this.addContingencyCell(rowTotals[k], cell);
          
          postHeaderRows[k].push(<td className="ctngcyCell">{this.renderContingencyTableCell(matrix[k][l])}</td>);

        }
        //row totals i.e. rightmost column
        rowTotals[k].column_percentage = -1;
        rowTotals[k].row_percentage = -1;
        if (k == 0) {
          headerRow.push(<th></th>);
        }
        postHeaderRows[k].push(<td className="ctngcyColumnFinish">{this.renderContingencyTableCell(rowTotals[k])}</td>);
        tableTotal = this.addContingencyCell(tableTotal, rowTotals[k]);

        //pushing to renderable component
        matrixRender.push(<tr>{postHeaderRows[k]}</tr>);
      }
      for (var l = 0; l < matrix[0].length; l++) {
        columnTotals.push(this.blankContingencyCell());
        for (var k = 0; k < matrix.length; k++) {
          columnTotals[l] = this.addContingencyCell(columnTotals[l], matrix[k][l]);
        }
      }
      //column totals i.e. lowest row
      var columnTotalsRender = [];
      columnTotalsRender.push(<td></td>);
      for (var i = 0; i < columnTotals.length; i++) {
        columnTotals[i].row_percentage = -1;
        columnTotals[i].total_percentage = -1;
        columnTotalsRender.push(<td className="ctngcyRowFinish">{this.renderContingencyTableCell(columnTotals[i])}</td>);
      }
      //Leaving out percentages in bottommost left cell since they should be 100 but almost never are
      tableTotal.row_percentage = -1;
      tableTotal.total_percentage = -1;
      tableTotal.column_percentage = -1;
      columnTotalsRender.push(<td className="ctngcyTableFinish">{this.renderContingencyTableCell(tableTotal)}</td>);
      matrixRender.push(<tr>{columnTotalsRender}</tr>);
    }

    if (matrixRender && matrixRender.length != 0) {
      return (
        <div className="ctngcyTableContainer">
          <table className="ctngcyTable">
            <tbody>
              {matrixRender}
            </tbody>
          </table>
        </div>
      )
    } else {
      return (
        <div>
          <p>No table to display.</p>
        </div>
      )
    }
  }
  //Statistics panel w/ table
  getMatrix() {
    return (
      <Panel>
        <Panel.Heading 
        style={{cursor:"pointer"}}
        onClick={()=> {
          var not = this.state.componentOpened;
          not["cTable"] = !not["cTable"];
          this.setState({ componentOpened : not });
        }}>
          <Panel.Title componentClass="h3">
            Contingency Table
          </Panel.Title>
        </Panel.Heading>
        <Collapse in={this.state.componentOpened["cTable"]}>
          <Panel.Body>
            {this.renderContingencyTable()}
          </Panel.Body>
        </Collapse>
      </Panel>
    )
  }
  //Formatting floats
  formatTable(n) {
    var roundTo = this.state.ctngcyTableRoundTo;
    if (n != 0 && ((n <= 0.0001 && n >= -0.0001) || (n > 10000 || n < -10000))) {
      //Scientific notation
      return n.toExponential(roundTo).toString();
    } else if (n) {
      var n = n && n != 0 ? parseFloat(n).toFixed(roundTo) : 0,
          d = (Math.log10((n ^ (n >> 31)) - (n >> 31)) | 0) + 1;
      if (!n.toString().includes('.')) n = n.toString()+'.';
      return n.toString().padEnd(roundTo+d+1, '0');
    } else {
      n = "0";
      if (roundTo > 0) {
        n = "0.";
        return n.padEnd(roundTo+2, "0");
      }
      return n;
    }
  }

  getTableStatistics() {
    if (this.state.selectedEdge && this.state.selectedEdge.edge_attributes) {
      var stats = new edgeStats.edgeStats(this.state.selectedEdge),
          gamma = stats.getGammaCoefficientString(),
          pval = stats.getPValString(),
          chi = stats.getChiSquareString(),
          phi = stats.getPhiCoefficientString(),
          pearsoncont = stats.getPearsonContingencyString(),
          cramerv = stats.getCramersVString();
      var displayText = (text) => {
        return (<p>{text}</p>);
        //return (<div className="ctngcyTooltip">{text}<div className="ctngcyTooltipText">{hover}</div></div>)
      }
      return (
      <Panel>
        <Panel.Heading>
          <Panel.Title componentClass="h3">
            Statistics
          </Panel.Title>
        </Panel.Heading>
        <Panel.Body>
        <div className="ctngcyStatsPanel">
            {pval ? displayText(pval) : null}
            {chi ? displayText(chi) : null}
            {(gamma || phi || pearsoncont || cramerv) ? <h3>From Table</h3> : null}
            {gamma ? displayText(gamma) : null}
            {phi ? displayText(phi) : null}
            {pearsoncont ? displayText(pearsoncont) : null}
            {cramerv ? displayText(cramerv) : null}
            {(!gamma && !pval && !chi && !phi && !pearsoncont && !cramerv) ? <h3>{"Nothing to display"}</h3> : null}
          </div>
        </Panel.Body>
      </Panel>
      )
    } else {
      return (null)
    }
  }

  downloadPublicationsInfo(publications) {
    const defaultInfo = {
      id: '',
      title: 'Unable to fetch publication information',
      authors: [],
      journal: '',
      source: '',
      pubdate: '',
      url: '',
      doid: '',
    };
    const getInfo = (pub) => {
      const paperInfo = {
        id: pub.uid,
        title: pub.title,
        authors: pub.authors,
        journal: pub.fulljournalname,
        source: pub.source,
        pubdate: pub.pubdate,
        url: `https://www.ncbi.nlm.nih.gov/pubmed/${pub.uid}/`,
        doid: pub.elocationid,
      };
      return { ...defaultInfo, ...paperInfo };
    };

    const getPubmedInformation = (pmid) => {
      let pmidStr = pmid.toString();
      if ((typeof pmidStr === 'string' || pmidStr instanceof String) && (pmidStr.indexOf(':') !== -1)) {
        // pmidStr has a colon, and therefore probably a curie, remove it.
        pmidStr = pmidStr.substr(pmidStr.indexOf(':') + 1);
      }

      return new Promise((resolve, reject) => {
        this.appConfig.getPubmedPublications(
          pmidStr,
          (pub) => {
            resolve(getInfo(pub));
          },
          (err) => {
            console.log(err);
            reject(defaultInfo);
          },
        );
      });
    };

    Promise.all(publications.map(pmid => new Promise(resolve => resolve(getPubmedInformation(pmid))))).then((data) => {
      // Transform the data into a json blob and give it a url
      // const json = JSON.stringify(data);
      // const blob = new Blob([json], { type: 'application/json' });
      // const url = URL.createObjectURL(blob);

      const fields = ['url', 'title', 'journal', 'pubdate'];
      const replacer = (key, value) => { return value === null ? '' : value; };

      const csv = data.map(row => fields.map(f => JSON.stringify(row[f], replacer)).join(','));
      csv.unshift(fields.join(','));
      const csvText = csv.join('\n');

      const blob = new Blob([csvText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      // Create a link with that URL and click it.
      const a = document.createElement('a');
      a.download = 'publications.csv';
      a.href = url;
      a.click();
      a.remove();
    }).then(() => this.setState({ downloadingPubs: false }));
  }


  render() {
    return (
      <Row>
        <Col md={12}>
          <Row>
            <Col md={12}>
              <SubGraphViewer
                height={200}
                subgraph={{ node_list: this.state.subgraph.nodes, edge_list: this.state.subgraph.edges }}
                layoutStyle="auto"
                layoutRandomSeed={1}
                showSupport
                omitEdgeLabel={false}
                varyEdgeSmoothRoundness
                callbackOnGraphClick={this.onGraphClick}
                concepts={this.props.concepts}
              />
            </Col>
          </Row>
          <Row>
            <Col md={4}>
              {this.getNodeInfoFrag(this.state.subgraph.nodes[0])}
            </Col>
            <Col md={4}>
              {this.getEdgeInfoFrag(this.state.selectedEdge)}
            </Col>
            <Col md={4}>
              {this.getNodeInfoFrag(this.state.subgraph.nodes[1])}
            </Col>
          </Row>
          <Row>
            <Col md={9}>
              {this.getMatrix()}
            </Col>
            <Col md={3}>
              {this.getTableStatistics()}
            </Col>
          </Row>
          <Row>
            <Col md={12}>
              {this.getPublicationsFrag()}
            </Col>
          </Row>
        </Col>
      </Row>
    );
  }
}

export default AnswerExplorerInfo;
