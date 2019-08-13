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
	}

	getPhiCoefficient() {
    var matrix = this.matrix;
    //only relevant in a binary association
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
      var denom = Math.sqrt(e*f*g*h) != 0 ? Math.sqrt(e*f*g*h) : 1;
      var phi = (a*b - c*d)/denom;
      return phi;
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

  getPhiCoefficientString() {
		var phi = this.getPhiCoefficient(),
        interpretation = this.interpretVal(phi, [-1,-0.7,-0.3,0.3,0.7], ["Strong Negative", "Weak Negative", "Little or No", "Weak Positive", "Strong Positive"], " Association");
		return phi ? "Phi Coefficient: " + this.formatFloat(phi) + " (" + interpretation + ")" : null;
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

  getGammaCoefficient() {
    var nc = 0, //concordant pairs
        nd = 0, //reversed pairs
        matrix = this.matrix;
    if (matrix) {
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
	}

	getGammaCoefficientString() {
		var g = this.getGammaCoefficient(),
        interpretation = this.interpretVal(g, [-1,-0.7,-0.3,0.3,0.7], ["Strong Inversion", "Weak Inversion", "No Association", "Weak Agreement", "Strong Agreement"],"");
		return g ? "Goodman/Kruskal's Gamma: " + this.formatFloat(g) + " (" + interpretation + ")" : null;
	}

  getNumObservations() {
    var n = this.matrix.length * this.matrix[0].length;
    this.matrix.forEach((e) => {
      if (e.length != this.matrix[0].length) {
        return NaN;
      }
    });
    return n;
  }

  getChiSquare() {

  }

  getPearsonContingency() {
    if (this.matrix) {
      return Math.sqrt(this.getChiSquare()/(this.getNumObservations()+this.getChiSquare()));
    }
    return NaN;
  }

  getPearsonContingencyString() {
    var c = this.getPearsonContingency();
    return c ? "Pearson Contingency Coefficient: " + this.formatFloat(c) : null;
  }

  getCramersV() {
    if (this.matrix) {
      var n = this.getNumObservations(),
          chi = this.getChiSquare(),
          r = this.matrix.length,
          k = n/r;
      if (k && r && chi && n) {
        return Math.sqrt((chi)/n*Math.min(k-1,r-1));
      }
      return NaN;
    }
  }

  getCramersVString() {
    var v = this.getCramersV();
    return v ? "Cramer's V (Uncorrected): " + this.formatFloat(v) : null;
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
}

// for node.js
module.exports.edgeStats = edgeStats;