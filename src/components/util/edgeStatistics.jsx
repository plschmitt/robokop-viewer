/*
Statistically analyzing graph edges for use by edge explorer, subgraphviewer etc.
Patrick Schmitt
*/
class edgeStats {
	constructor(edge) {
		this.edge = edge;
		this.attr = edge ? edge.edge_attributes : null;
		this.matrix = this.attr ? this.attr.feature_matrix : null;
		this.roundTo = 3;
    //is the matrix rectangular/frequency defined for all cells?
    this.validMatrix = true;
    console.log("testing matrix validity");
    console.log(this.matrix);
    if (!this.matrix) {
      this.validMatrix = false;
    } else {
      var rowLength = this.matrix[0].length;
      for (var i = 0; i < this.matrix.length; i++) {
        if (this.matrix[i].length != rowLength) {
          this.validMatrix = false;
        }
        for (var j = 0; j < this.matrix[i].length; j++) {
          if (!this.matrix[i][j].frequency) {
            this.validMatrix = false;
          }
        }
      }
    }
	}

  interpretVal(n, values, interpretations, suffix) {
    var result = "";
    for (var i = 0; i < values.length; i++) {
      if (n >= values[i] && (i+1 >= values.length || n < values[i+1])) {
        result = interpretations[i];
      }
    }
    return result + suffix;
  }

  formatFloat(n) {
    var roundTo = this.roundTo;
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

  isValidMatrix() {
    return this.validMatrix;
  }

  getChiSquare() {
  	return this.attr ? this.attr.chi_squared : null;
  }

  getChiSquareString() {
		return this.getChiSquare() ? "Chi Square: " + this.formatFloat(this.getChiSquare()) : null;
  }

  getPVal() {
  	return this.attr ? this.attr.p_value : null;
  }

  getPValString() {
  	return this.getPVal() ? "P-Value: " + this.formatFloat(this.getPVal()) : null;
  }

  //NOTE: strings for table-derived measures will not return null, since
  //they should be displayed regardless so long as there's a table in the statistics tab

  getPhiCoefficient() {
    var matrix = this.matrix;
    //only relevant in a binary association
    if (this.validMatrix) {
      if (!matrix || (matrix.length != 2 || matrix[0].length != 2 || matrix[1].length != 2)) {
        return NaN;
      } else {
        var a = matrix[0][0] ? matrix[0][0].frequency : 0,
            b = matrix[0][1] ? matrix[0][1].frequency : 0,
            c = matrix[1][0] ? matrix[1][0].frequency : 0,
            d = matrix[1][1] ? matrix[1][1].frequency : 0,
            g = a+c, h = b+d, e = a+b, f = c+d;
        //0s in the matrix wont do
        if (a*b*c*d == 0) {
          return NaN;
        }
        var denom = Math.sqrt(e*f*g*h);
        var phi = (a*b - c*d)/denom;
        return phi;
      }
    }
    return NaN;
  }

  getPhiCoefficientString() {
    var phi = this.getPhiCoefficient(),
        interpretation = this.interpretVal(phi, [-1,-0.7,-0.3,0.3,0.7], ["Strong Negative", "Weak Negative", "Little or No", "Weak Positive", "Strong Positive"], " Association");
    return "Phi Coefficient: " + this.formatFloat(phi) + (interpretation ? " (" + interpretation + ")" : "");
  }

  getGammaCoefficient() {
    var nc = 0, //concordant pairs
        nd = 0, //reversed pairs
        matrix = this.matrix;
        console.log("gamma");
    if (this.validMatrix) {
      for (var i = 0; i < matrix.length; i++) {
        for (var j = 0; j < matrix[i].length; j++) {
          var nci = matrix[i][j].frequency ? matrix[i][j].frequency : 0,
              concordanceSum = 0,
              discordanceSum = 0;
          for (var x = 0; x < matrix.length; x++) {
            for (var y = 0; y < matrix[x].length; y++) {
              //a pair i',j' is concordant with i,j if (i'-i)(j'-j)>0
              /*if (y > j && x > i) {
                concordanceSum += freq;
              }
              else if (y < j && x > i) {
                discordanceSum += freq;
              }*/
              var concordance = (x-i)*(y-j),
                  freq = matrix[x][y].frequency ? matrix[x][y].frequency : 0;
              if (concordance > 0) {
                concordanceSum += freq;
              } else if (concordance < 0) {
                discordanceSum += freq;
              }
            }
          }
        nc += nci * concordanceSum;
        nd += nci * discordanceSum;
        }
      }
    return (nc - nd)/(nc + nd);
		}
    return NaN;
	}

	getGammaCoefficientString() {
		var g = this.getGammaCoefficient(),
        interpretation = this.interpretVal(g, [-1,-0.7,-0.3,0.3,0.7], ["Strong Inversion", "Weak Inversion", "No Association", "Weak Agreement", "Strong Agreement"],"");
		return "Goodman/Kruskal's Gamma: " + this.formatFloat(g) + (interpretation ? " (" + interpretation + ")" : "");
	}

  getNumCells() {
    var n = 0;
    for (var i = 0; i < this.matrix.length; i++) {
      n += matrix[i].length;
    }
    return n;
  }

  getNumObservations() {
    var n = 0;
    for (var i = 0; i < this.matrix.length; i++) {
      for (var j = 0; j < this.matrix[i].length; j++) {
        n += this.matrix[i][j].frequency;
      }
    }
    return n;
  }

  getPearsonContingency() {
    if (this.validMatrix) {
      return Math.sqrt(this.getChiSquare()/(this.getNumObservations()+this.getChiSquare()));
    }
    return NaN;
  }

  getPearsonContingencyString() {
    var c = this.getPearsonContingency();
    return "Pearson Contingency Coefficient: " + this.formatFloat(c);
  }

  getCramersV() {
    if (this.validMatrix) {
      var n = this.getNumObservations(),
          chi = this.getChiSquare(),
          r = this.matrix.length,
          k = this.matrix[0].length;
      if (k && r && chi && n) {
        return Math.sqrt((chi)/n*Math.min(k-1,r-1));
      }
      return NaN;
    }
  }

  getCramersVCorrected() {
    if (this.validMatrix) {
      var n = this.getNumObservations(),
          chi = this.getChiSquare(),
          r = this.matrix.length,
          k = this.matrix[0].length,
          rhat = r-(Math.pow(r-1,2)/n-1),
          khat = k-(Math.pow(k-1,2)/n-1),
          phi = chi/n,
          phihat = Math.max(0,phi-(((k-1)*(r-1))/(n-1)));
      if (phihat && khat && rhat) {
        return Math.sqrt(phihat/Math.min(khat-1,rhat-1));
      }
      return NaN;
    }
  }

  getCramersVString() {
    var v = this.getCramersV(),
        vc = this.getCramersVCorrected();
    if (v && vc) {
      return "Cramer's V (Standard/Bias Corrected): " + this.formatFloat(v) + "/" + this.formatFloat(vc);
    }
    return "Cramer's V: " + v;
  }
}

// for node.js
module.exports.edgeStats = edgeStats;