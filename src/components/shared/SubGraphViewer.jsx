import React from 'react';
import getNodeTypeColorMap from '../util/colorUtils';
import entityNameDisplay from '../util/entityNameDisplay';

const Graph = require('react-graph-vis').default;
const shortid = require('shortid');
const _ = require('lodash');

import edgeStats from './../util/edgeStatistics';

class SubGraphViewer extends React.Component {
  constructor(props) {
    super(props);

    this.styles = {
      supportEdgeColors: {
        color: '#aaa',
        hover: '#aaa',
        opacity: 0.5,
      },
    };
    this.graphOptions = {
      autoResize: true,
      height: '500px',
      physics: {
        minVelocity: 1,
        barnesHut: {
          gravitationalConstant: 0,
          centralGravity: 0.3,
          springLength: 200,
          springConstant: 0.05,
          damping: 0.95,
          avoidOverlap: 0,
        },
      },
      layout: {
        randomSeed: 0,
        improvedLayout: true,
      },
      edges: {
        color: {
          color: '#000',
          highlight: '#000',
          hover: '#000',
        },
        hoverWidth: 1,
        selectionWidth: 1,
        // smooth: {
        //   enabled: true,
        //   type: 'dynamic',
        // },
      },
      nodes: {
        shape: 'box',
        labelHighlightBold: false,
        borderWidthSelected: 2,
        borderWidth: 1,
        chosen: false,
      },
      interaction: {
        hover: true,
        zoomView: true,
        dragView: true,
        hoverConnectedEdges: true,
        selectConnectedEdges: false,
        selectable: true,
        tooltipDelay: 50,
      },
      // configure: {
      //   enabled: true,
      //   showButton: true,
      // },
    };

    this.state = {
      displayGraph: null,
      displayGraphOptions: this.graphOptions,

      edgeRescalingBounds: [0.5,10],
      enableGradientColoring: true,
      enablePValueScaling: true,
    };

    this.syncStateAndProps = this.syncStateAndProps.bind(this);
    this.addTagsToGraph = this.addTagsToGraph.bind(this);
    this.setNetworkCallbacks = this.setNetworkCallbacks.bind(this);
    this.clickCallback = this.clickCallback.bind(this);
  }

  componentDidMount() {
    this.syncStateAndProps(this.props);
  }
  componentWillReceiveProps(nextProps) {
    this.syncStateAndProps(nextProps);
  }

  shouldComponentUpdate(nextProps) {
    // Only redraw/remount component if subgraph components change
    if (_.isEqual(this.props.subgraph, nextProps.subgraph) && this.network) {
      return false;
    }
    return true;
  }

  syncStateAndProps(newProps) {
    let graph = newProps.subgraph;

    const isValid = !(graph == null) && (Object.prototype.hasOwnProperty.call(graph, 'node_list'));
    if (isValid) {
      graph = this.addTagsToGraph(graph);
    }
    const graphOptions = this.getGraphOptions(graph);

    this.setState({ displayGraph: graph, displayGraphOptions: graphOptions }, this.setNetworkCallbacks);
  }

  clickCallback(event) {
    // Add edge objects not just ids
    event.edgeObjects = event.edges.map(eId => this.state.displayGraph.edges.find(displayEdge => displayEdge.id === eId));
    event.graph = this.state.displayGraph;
    this.props.callbackOnGraphClick(event);
  }

  // Bind network fit callbacks to resize graph and cancel fit callbacks on start of zoom/pan
  setNetworkCallbacks() {
    const stopLayout = () => {
      this.network.stopSimulation();
      this.network.physics.physicsEnabled = false;
    };
    const afterDraw = () => {
      setTimeout(() => { stopLayout(); this.network.fit(); }, 2500);
    };
    const startLayout = () => {
      this.network.once('afterDrawing', afterDraw);
      this.network.physics.physicsEnabled = true;
      this.network.startSimulation();
    };
    const toggleLayout = () => {
      if (this.network.physics.physicsEnabled) {
        stopLayout();
      } else {
        startLayout();
      }
    };

    try {
      this.network.once('afterDrawing', afterDraw);
      this.network.on('doubleClick', () => { this.network.off('afterDrawing'); this.network.fit(); toggleLayout(); });
      this.network.on('zoom', () => this.network.off('afterDrawing'));
      this.network.on('dragStart', () => this.network.off('afterDrawing'));
      this.network.on('dragEnd', () => { setTimeout(stopLayout, 5); });
      // this.network.on('stabilizationIterationsDone', () => { setTimeout(() => this.network.stopSimulation(), 5); });
    } catch (err) {
      console.log(err);
    }
  }

  getGraphOptions(graph) {
    const { graphOptions } = this;
    const nNodes = 'nodes' in graph ? graph.nodes.length : 0;

    graphOptions.height = `${this.props.height}px`;
    let modifiedOptions = {};
    if (this.props.layoutStyle === 'auto') {
      modifiedOptions = {
        layout: {
          randomSeed: this.props.layoutRandomSeed,
          // improvedLayout: true,
        },
      };
    }

    // Check for graph duplicate edges
    // In the event of duplicate edges directed layout doesn't work, we must stick with physics and auto
    const duplicateEdges = graph.edges.reduce((val, e) => (val || e.moreThanOneEdge), false);
    if (!duplicateEdges && ((this.props.layoutStyle === 'vertical') || (this.props.layoutStyle === 'horizontal') || nNodes < 3)) {
      let direction = 'LR';
      if (this.props.layoutStyle === 'vertical') {
        direction = 'UD';
      }

      modifiedOptions = {
        layout: {
          randomSeed: undefined,
          hierarchical: {
            enabled: true,
            levelSeparation: 500,
            nodeSpacing: 200,
            treeSpacing: 200,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
            direction,
            sortMethod: 'directed',
          },
        },
        physics: false,
      };
    }

    // Last minute modification of graph options based on size of graph
    if (nNodes < 31 && 'barnesHut' in graphOptions.physics) {
      graphOptions.physics.barnesHut.avoidOverlap = 1;
    }

    return { ...graphOptions, ...modifiedOptions };
  }

  // Method to add requisite tags to graph definition JSON before passing to vis.js
  addTagsToGraph(graph) {
    // Adds vis.js specific tags primarily to style graph as desired
    const g = _.cloneDeep(graph);
    // nodes -> node_list
    g.edges = g.edge_list;
    delete g.edge_list;
    g.nodes = g.node_list;
    delete g.node_list;

    const nodeTypeColorMap = getNodeTypeColorMap(this.props.concepts); // We could put standardized concepts here

    // remove all duplicate nodes
    const nodeIds = new Set();
    g.nodes = g.nodes.filter((unique) => {
      if (nodeIds.has(unique.id)) {
        return false;
      }
      nodeIds.add(unique.id);
      return true;
    });
    // remove all duplicate edges
    const edgeIds = new Set();
    g.edges = g.edges.filter((unique) => {
      if (edgeIds.has(unique.id)) {
        return false;
      }
      edgeIds.add(unique.id);
      return true;
    });

    g.nodes.forEach((n) => {
      const backgroundColor = nodeTypeColorMap(n.type);
      n.color = {
        border: '#000000',
        background: backgroundColor,
        highlight: { background: backgroundColor, border: '#000000' },
        hover: { background: backgroundColor, border: '#000000' },
      };

      // Set shortened node labels and tool-tip for each node
      n.label = n.name.length > 15 ? `${n.name.substring(0, 13)}...` : n.name;
      n.title = (`
        <div class="vis-tooltip-inner">
          <div><span class="title">${n.name}</span></div>
          <div><span class="field-name">id: </span>${n.id}</div>
          <div><span class="field-name">type: </span>${entityNameDisplay(n.type)}</div>
        </div>`
      );
    });

    // Separate out support and regular edges to modify things differently
    const edgesRegular = g.edges.filter(e => e.type !== 'literature_co-occurrence');
    const edgesSupport = g.edges.filter(e => e.type === 'literature_co-occurrence');

    edgesSupport.forEach((e) => {
      // Make sure support edges actually have publications
      e.duplicateEdge = false; // Also by default do not delete support edges unless duplicate
      if (('publications' in e && Array.isArray(e.publications))) {
        // Everything is good
      } else if (('publications' in e && !Array.isArray(e.publications))) {
        // Single entry comes as a string
        e.publications = [e.publications];
      } else if (!('publications' in e)) {
        e.publications = []; // How did this happen?
      }
      e.moreThanOneEdge = false; // If we don't remove a support edge it is because it is the only left.

      // Check if this is a self support edge
      // These are not particularly informative in display
      e.selfEdge = e.source_id === e.target_id;
      // e.selfEdge = false;
    });

    const mashSupportAndKnowledgeSourceEdges = false;
    if (mashSupportAndKnowledgeSourceEdges) {
      edgesRegular.forEach((e) => {
        // Find support edges between the same two nodes and merge publication lists

        // Find existing publications attached to the edge.
        let edgePublications = [];
        if ('publications' in e) {
          if (Array.isArray(e.publications)) {
            edgePublications = e.publications;
          } else if (typeof myVar === 'string') {
            edgePublications = [e.publications];
          }
        }

        // Find a corresponding support edge
        const sameNodesSupportEdge = edgesSupport.find(s => (((e.source_id === s.source_id) && (e.target_id === s.target_id)) || ((e.source_id === s.target_id) && (e.target_id === s.source_id))));
        if (sameNodesSupportEdge) {
          // We have a repeated edge
          sameNodesSupportEdge.duplicateEdge = true; // Mark for deletion

          const supportPublications = sameNodesSupportEdge.publications;
          edgePublications = edgePublications.concat(supportPublications);
          edgePublications = edgePublications.filter((p, i, self) => self.indexOf(p) === i); // Unique
        }
        e.publications = edgePublications;
      });
    }

    edgesRegular.forEach((e) => {
      // Find edges that go between the same two nodes and mark them accordingly

      // Find a corresponding support edge
      const sameNodesEdge = edgesRegular.filter(e2 => (((e.source_id === e2.source_id) && (e.target_id === e2.target_id)) || ((e.source_id === e2.target_id) && (e.target_id === e2.source_id))));
      sameNodesEdge.splice(sameNodesEdge.findIndex(e2 => e2.id === e.id), 1);
      if (sameNodesEdge.length > 0) {
        // We have a repeated edge
        e.moreThanOneEdge = true;
      } else {
        e.moreThanOneEdge = false;
      }
    });

    // Remove the duplicated support edges
    g.edges = [].concat(edgesSupport.filter(s => !s.duplicateEdge && !s.selfEdge), edgesRegular);
    // g.edges = [].concat(edgesRegular, edgesSupport.filter(s => !s.duplicateEdge && !s.selfEdge));

    if (this.props.varyEdgeSmoothRoundness) {
      // For each node pair
      // Find any edges between those nodes (in either direction)
      // Loop through those edges and set smooth
      const types = ['curvedCCW', 'curvedCW'];
      for (let iNode = 0; iNode < g.nodes.length; iNode += 1) {
        const n1 = g.nodes[iNode];
        for (let jNode = iNode; jNode < g.nodes.length; jNode += 1) {
          const n2 = g.nodes[jNode];
          const theseNodeEdges = g.edges.filter(e => (((e.source_id === n1.id) && (e.target_id === n2.id)) || ((e.target_id === n1.id) && (e.source_id === n2.id))));

          let roundnessStep = 0.15;
          if (theseNodeEdges.length > 13) {
            // Roundness must be between 0 and 1. In general for less than 13 edges steps of 0.15 looks good
            // If we have more than 13 we need to decrease this to squeeze them all in the 0 to 1 range
            // We divide by two beceause we alternate top and bottom
            roundnessStep = 1 / (Math.ceil(theseNodeEdges.length) / 2);
          }
          theseNodeEdges.forEach((e, i) => {
            e.smooth = {
              enabled: true,
              type: types[i % 2],
              roundness: Math.floor((i + 1) / 2) * roundnessStep,
            };
          });
        }
      }
    }
    // TODO: Remove any straggler duplicate edges (Fix me)
    // const fromTo = [];
    // const deleteMe = g.edges.map((e) => {
    //   const thisFromTo = `${e.source_id}_${e.target_id}`;
    //   if (fromTo.includes(thisFromTo)) {
    //     return true;
    //   }
    //   fromTo.push(thisFromTo);
    //   return false;
    // });
    // g.edges = g.edges.filter((e, i) => !deleteMe[i]);

    // Add parameters to edges like curvature and labels and such
    g.edges = g.edges.map((e, i) => {
      let typeDependentParams = {};
      let label = e.type;
      let nPublications = e.publications ? e.publications.length : 0;
      if (nPublications === 0 && 'nPublications' in e) {
        nPublications = e.nPublications;
      }
      if (nPublications > 0) {
        label = `${e.type} (${nPublications})`;
      }

      // const value = Math.ceil((Math.log(nPublications + 1) / Math.log(5)) * 2) + 1;
      // const value = Math.ceil((15 / (1 + Math.exp(-1 * (-1 + (0.02 * nPublications))))) - 3);
      const value = (4 / (1 + Math.exp(-1 * (-1 + (0.01 * nPublications))))) - 1;

      if (e.type === 'literature_co-occurrence') {
        // Publication Edge
        label = `${nPublications}`; // Remove the type labeled to keep it small

        let smoothLit = {
          enabled: true,
          type: 'dynamic',
        };
        if (this.props.varyEdgeSmoothRoundness) {
          smoothLit = e.smooth;
        }
        typeDependentParams = {
          color: this.styles.supportEdgeColors,
          // dashes: [2, 4],
          physics: false,
          font: {
            color: '#777',
            align: 'middle',
            strokeColor: '#fff',
          },
          arrows: {
            to: {
              enabled: false,
            },
          },
          smooth: smoothLit,
        };
      }

      if (this.props.omitEdgeLabel) {
        label = '';
      }
      let smooth = { forceDirection: 'none' };
      if (e.moreThanOneEdge) {
        smooth = { enabled: true, type: 'dynamic' };
      }
      if (this.props.varyEdgeSmoothRoundness) {
        ({ smooth } = e);
      }
      e.from = e.source_id;
      e.to = e.target_id;
      // Assign a unique id to the edge
      if (e.id) {
        e.edgeIdFromKG = e.id;
      }

      const defaultParams = {
        label,
        labelHighlightBold: false,
        value,
        font: {
          color: '#000',
          align: 'top',
          strokeColor: '#fff',
        },
        smooth,
        scaling: {
          min: 0.1,
          max: 10,
          label: false,
          customScalingFunction: (min, max, total, val) => Math.max(val, 0),
        },

        arrowStrikethrough: false,
      };

      return { ...e, ...defaultParams, ...typeDependentParams };
    });
    if (!this.props.showSupport) {
      g.edges = g.edges.filter(e => e.type !== 'literature_co-occurrence');
    }

    //Scaling by p-value if applicable, and coloring by Kurskal Gamma if contingency table
    //is present. Can be disabled/modified in state preferences.
    g.edges.forEach((e) => {
      if (this.state.enableGradientColoring) {
        var gradientFromVal = (n) => {
          var inputBounds = [-1,1],
          //note: right now it's just red->black->blue but color scheme can be easily modified
          //colorBounds=[[0,220,255],[220,0,255],[255,0,0],[220,0,255],[0,220,255]];
          colorBounds = [[230,0,0],[0,0,0],[0,0,230]],
          colors = [0,0,0],
          val = ((n - inputBounds[0]) / (inputBounds[1]-inputBounds[0])),
          start = Math.floor(val*(colorBounds.length-1)),
          end = Math.ceil(val*(colorBounds.length-1));
          for (var i = 0; i < 3; i++) {
            colors[i] = colorBounds[start][i] + val * (colorBounds[end][i] - colorBounds[start][i]);
          }
          return colors;
        }
        var brighten = (arr, amount) => {
          for (var i = 0; i < 3; i++) {
            arr[i] = Math.min(255,arr[i]+amount);
          }
          return arr;
        }
        var toHex = (arr) => {
          var hex = "";
          for (var i = 0; i < 3; i++) {
            hex = hex + Math.floor(arr[i]).toString(16).padStart(2,'0');
          }
          return hex;
        }

        var stats = new edgeStats.edgeStats(e),
            g = stats.getGammaCoefficient();

        if (g) {
          var gradient = gradientFromVal(g);
          e.color = {
            color : toHex(gradient),
            highlight : toHex(brighten(gradient,20)),
            hover : toHex(brighten(gradient,20)),
            opacity : 1.0,
            dashes : false,
          };
        }
      }
      if (this.state.enablePValueScaling) {
        var p = e ? e.edge_attributes ? e.edge_attributes.p_value : null : null;
        if (p) {
          var alpha = 0.1;
          p = (Math.pow(p,-1)-1)*0.3;
          if (p > alpha) {
            p *= 0.5;
          }
          var max = Math.max(this.state.edgeRescalingBounds[1],this.state.edgeRescalingBounds[0]),
              min = Math.min(this.state.edgeRescalingBounds[1],this.state.edgeRescalingBounds[0]),
          p = Math.max(Math.min(p,max),min);
          e.scaling.min = p;
          e.scaling.max = p;
        }
      }
    });

    return g;
  }

  render() {
    const graph = this.state.displayGraph;
    const isValid = !(graph == null);
    return (
      <div>
        {isValid &&
          <div style={{ fontFamily: 'Monospace' }}>
            <Graph
              key={shortid.generate()} // Forces component remount
              graph={graph}
              style={{ width: '100%' }}
              options={this.state.displayGraphOptions}
              events={{ click: this.clickCallback }}
              getNetwork={(network) => { this.network = network; }} // Store network reference in the component
            />
          </div>
        }
      </div>
    );
  }
}

SubGraphViewer.defaultProps = {
  layoutRandomSeed: 0,
  layoutStyle: 'auto',
  height: 600,
  showSupport: false,
  omitEdgeLabel: false,
  varyEdgeSmoothRoundness: false,
  callbackOnGraphClick: () => {},
};

export default SubGraphViewer;
