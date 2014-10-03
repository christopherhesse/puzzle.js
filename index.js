// utility

var array_to_object = function(array) {
  var object = {}
  for (var i = 0; i < array.length; i += 2) {
    object[array[i]] = array[i + 1]
  }
  return object
}

var max = function(array) {
  return Math.max.apply(null, array)
}

var min = function(array) {
  return Math.min.apply(null, array)
}

var Point = function(x, y) {
  this.x = x
  this.y = y
}

Point.prototype = {
  add: function(v) {
    return new Point(this.x + v.x, this.y + v.y)
  },
  subtract: function(v) {
    return new Point(this.x - v.x, this.y - v.y)
  },
  multiply_scalar: function(s) {
    return new Point(this.x * s, this.y * s)
  },
  magnitude: function() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }
}

//-------------------------------------------------
//--- Code snippet from The Math Vault ---
//--- Calculate random (C) Antti Sykäri 2013 ---
//-------------------------------------------------
// http://stackoverflow.com/questions/521295/javascript-random-seeds
var _random_state = 1
var random = function() {
  var x = Math.sin(_random_state++) * 10000
  return x - Math.floor(x)
}

// global

var g = {}

var MATCH_DISTANCE = 20
var PIECE_SIZE = 200

var UP = 0
var RIGHT = 1
var DOWN = 2
var LEFT = 3
var DIRECTIONS = 4

var direction_to_point = function(direction) {
  return array_to_object([
    UP, new Point(0, -1),
    RIGHT, new Point(1, 0),
    DOWN, new Point(0, 1),
    LEFT, new Point(-1, 0),
  ])[direction]
}

var invert_direction = function(direction) {
  return array_to_object([
    UP, DOWN,
    RIGHT, LEFT,
    DOWN, UP,
    LEFT, RIGHT,
  ])[direction]
}

var tile_to_row = function(tile) {
  return Math.floor(tile / g.col_count)
}

var tile_to_col = function(tile) {
  return tile % g.col_count
}

var tile_to_center = function(tile) {
  var location = new Point(tile_to_col(tile), tile_to_row(tile))
  var center_location = new Point(0.5, 0.5).add(location)
  return center_location.multiply_scalar(PIECE_SIZE)
}

var row_col_to_tile = function(row, col) {
  return col + row * g.col_count
}

var LINE = 0
var BEZIER = 1

var Path = function(commands) {
  this.commands = commands
}

Path.prototype = {
  render: function(ctx) {
    for (var i = 0; i < this.commands.length; i++) {
      var c = this.commands[i]
      if (c.op == LINE) {
        ctx.lineTo(c.x, c.y)
      } else if (c.op == BEZIER) {
        ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, c.x, c.y)
      }
    }
  },
}

var create_piece = function(tiles) {
  var rows = tiles.map(tile_to_row)
  var cols = tiles.map(tile_to_col)
  var row_span = max(rows) - min(rows) + 1
  var col_span = max(cols) - min(cols) + 1
  var border_width = 30

  var p = document.createElement('canvas')
  p.className = 'piece'
  p.style.position = 'absolute'
  p.style.top = 0
  p.style.left = 0
  p.width = border_width * 2 + col_span * PIECE_SIZE
  p.height = border_width * 2 + row_span * PIECE_SIZE
  p.style['z-index'] = g.max_z_index++

  var ctx = p.getContext('2d')

  var border = new Point(1, 1).multiply_scalar(border_width)
  var center_to_corner = new Point(0.5, 0.5).multiply_scalar(PIECE_SIZE).add(border)
  var size = new Point(1, 1).multiply_scalar(PIECE_SIZE).add(border.multiply_scalar(2))
  var piece_offset = new Point(min(cols), min(rows)).multiply_scalar(PIECE_SIZE)
  p.tiles = []
  p.tile_centers = {}
  for (var i = 0; i < tiles.length; i++) {
    var tile = tiles[i]

    var mask_f = function(ctx) {
      ctx.save()

      ctx.translate(border_width, border_width)
      ctx.beginPath()
      ctx.moveTo(0, 0)

      // checkerboard pattern
      var even = function(n) { return n % 2 == 0 }
      var clockwise = even(tile_to_row(tile)) == even(tile_to_col(tile))

      if (clockwise) {
        var directions = [UP, RIGHT, DOWN, LEFT]
        var angle = Math.PI / 2
      } else {
        var directions = [LEFT, DOWN, RIGHT, UP]
        var angle = -Math.PI / 2
        ctx.rotate(Math.PI / 2)
      }

      for (var i = 0; i < directions.length; i++) {
        var d = directions[i]
        var edge_path = null
        if (tiles.indexOf(get_neighbor_tile(tile, d)) == -1) {
          edge_path = g.edge_paths[tile][d]
        }

        if (edge_path !== null) {
          edge_path.render(ctx)
        } else {
          ctx.lineTo(PIECE_SIZE, 0)
        }
        ctx.translate(PIECE_SIZE, 0)
        ctx.rotate(angle)
      }

      ctx.closePath()

      ctx.restore()
    }

    var mask_image = function(mask_f, image, src, size) {
      // clipping mask causes aliased images in chrome mac
      // use destination-in to perform clipping instead
      // http://stackoverflow.com/questions/9536257/how-to-anti-alias-clip-edges-in-html5-canvas-under-chrome-windows
      var c = document.createElement('canvas')
      c.width = size.x
      c.height = size.y
      var ctx = c.getContext('2d')
      ctx.drawImage(image, src.x, src.y, size.x, size.y, 0, 0, size.x, size
        .y)
      ctx.globalCompositeOperation = 'destination-in'
      mask_f(ctx)
      ctx.fill()
      return c
    }

    var src = tile_to_center(tile).subtract(center_to_corner)
    var dst = src.subtract(piece_offset).add(border)
    p.tile_centers[tile] = dst
    p.tiles.push(tile)
    var masked_image = mask_image(mask_f, g.image, src, size)
    ctx.drawImage(masked_image, dst.x, dst.y)
  }

  return p
}

var get_neighbor_tile = function(tile, direction) {
  var point = direction_to_point(direction)
  var r = tile_to_row(tile) + point.y
  var c = tile_to_col(tile) + point.x
  if (0 <= r && r < g.row_count && 0 <= c && c < g.col_count) {
    return row_col_to_tile(r, c)
  }
  return null
}

var match_nearby_pieces = function(piece) {
  var get_tile_piece = function(tile) {
    var pieces = document.getElementsByClassName('piece')
    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i]
      if (tile in piece.tile_centers) {
        return piece
      }
    }
  }

  var get_tile_position = function(piece, tile) {
    var tile_center = piece.tile_centers[tile]
    var piece_position = new Point(piece.offsetLeft, piece.offsetTop)
    return piece_position.add(tile_center)
  }

  var combine_pieces = function(source_piece, target_piece) {
    return create_piece(source_piece.tiles.concat(target_piece.tiles))
  }

  var get_neighbor_tiles = function(tile) {
    var neighbor_tiles = []
    for (var d = 0; d < DIRECTIONS; d++) {
      var neighbor_tile = get_neighbor_tile(tile, d)
      if (neighbor_tile == null) {
        continue
      }
      neighbor_tiles.push(neighbor_tile)
    }
    return neighbor_tiles
  }

  // if we dropped this near a matching piece, combine the two pieces
  for (tile in piece.tile_centers) {
    var tile_position = get_tile_position(piece, tile)

    var neighbor_tiles = get_neighbor_tiles(tile)
    for (var i = 0; i < neighbor_tiles.length; i++) {
      var neighbor_tile = neighbor_tiles[i]
      var neighbor_piece = get_tile_piece(neighbor_tile)
      if (neighbor_piece === piece) {
        continue
      }

      var matching_offset = tile_to_center(neighbor_tile).subtract(tile_to_center(tile))
      var neighbor_tile_position = get_tile_position(neighbor_piece, neighbor_tile)
      var neighbor_offset = neighbor_tile_position.subtract(tile_position)
      var match = matching_offset.subtract(neighbor_offset)

      if (match.magnitude() < MATCH_DISTANCE) {
        // match found combine pieces
        document.body.removeChild(piece)
        document.body.removeChild(neighbor_piece)

        var new_piece = combine_pieces(piece, neighbor_piece)
        document.body.appendChild(new_piece)

        // place
        var new_neighbor_tile_position = get_tile_position(new_piece, neighbor_tile)
        var piece_offset = neighbor_tile_position.subtract(
          new_neighbor_tile_position)
        new_piece.style.top = piece_offset.y
        new_piece.style.left = piece_offset.x

        if (new_piece.tiles.length == g.tile_count) {
          var e = document.createElement('div')
          e.innerText = 'victory'
          e.style.position = 'absolute'
          e.style.top = 0
          e.style.left = 0
          e.style.width = '100%'
          e.style['text-align'] = 'center'
          e.style['color'] = '#ff69b4'
          e.style['font-style'] = 'italic'
          e.style['font-size'] = '350px'
          e.style['z-index'] = 100000
          document.body.appendChild(e)

          var a = document.createElement('audio')
          a.src = 'meow.mp3'
          a.play()
        }
        return
      }
    }
  }
}

var setup_game = function() {
  g.col_count = Math.floor(g.image.width / PIECE_SIZE)
  g.row_count = Math.floor(g.image.height / PIECE_SIZE)
  g.tile_count = g.col_count * g.row_count
  g.max_z_index = 0
  g.edge_paths = {}

  // create edge paths
  for (var tile = 0; tile < g.tile_count; tile++) {
    g.edge_paths[tile] = {}
  }

  for (var tile = 0; tile < g.tile_count; tile++) {
    for (var d = 0; d < DIRECTIONS; d++) {
      if (g.edge_paths[tile][d] !== undefined) {
        continue
      }

      var neighbor_tile = get_neighbor_tile(tile, d)
      if (neighbor_tile === null) {
        g.edge_paths[tile][d] = null
      } else {
        // var y1 = Math.floor(random() * 10)
        // var y2 = Math.floor(random() * 10)
        // var y3 = Math.floor(random() * 10)
        // var edge_path = new Path([
        //   {
        //     op: LINE,
        //     x: PIECE_SIZE * 1/4,
        //     y: y1
        //   },
        //   {
        //     op: LINE,
        //     x: PIECE_SIZE * 2/4,
        //     y: y2
        //   },
        //   {
        //     op: LINE,
        //     x: PIECE_SIZE * 3/4,
        //     y: y3
        //   },
        //   {
        //     op: LINE,
        //     x: PIECE_SIZE * 4/4,
        //     y: 0
        //   },
        // ])
        var sign = function(x) { return x ? x < 0 ? -1 : 1 : 0 }
        var s = sign(random()-0.5)
        var edge_path = new Path([{op: LINE, x: 75, y: 0}, {op: BEZIER, cp1x: 75, cp1y: s * 30, cp2x: 125, cp2y: s * 30, x: 125, y: 0}, {op: LINE, x: 200, y:0}])
        g.edge_paths[tile][d] = edge_path
        g.edge_paths[neighbor_tile][invert_direction(d)] = edge_path
      }
    }
  }

  // create a piece for each tile
  for (var tile = 0; tile < g.tile_count; tile++) {
    var piece = create_piece([tile])
    piece.style.top = Math.random() * 300
    piece.style.left = Math.random() * 1000
    // piece.style.top = 150
    // piece.style.left = 300 * tile
    document.body.appendChild(piece)
  }

  // var piece = create_piece([1])
  // piece.style.top = Math.random() * 300
  // piece.style.left = Math.random() * 1000
  // document.body.appendChild(piece)

  // var piece = create_piece([1, 2, 5])
  // document.body.appendChild(piece)
  // var piece = create_piece([0, 3, 4])
  // document.body.appendChild(piece)

  // setup handlers for clicking on the pieces
  var active_piece = null
  var active_cursor_point = null

  document.body.onmousedown = function(e) {
    if (e.target.className == 'piece') {
      // find the topmost piece that has a non-transparent pixel here
      var point = new Point(e.x, e.y)

      // convert node list to array
      var pieces = Array.prototype.slice.call(document.getElementsByClassName('piece'))
      // sort by descending z-index
      pieces.sort(function(a, b) {
        return parseInt(b.style['z-index']) - parseInt(a.style['z-index'])
      })
      for (var i = 0; i < pieces.length; i++) {
        var piece = pieces[i]
        var offset_point = point.subtract(new Point(piece.offsetLeft, piece.offsetTop))
        // check if the offset is inside of the piece
        if (0 <= offset_point.x && offset_point.x <= piece.width && 0 <= offset_point.y && offset_point.y <= piece.height) {
          var pixel = piece.getContext('2d').getImageData(offset_point.x, offset_point.y, 1, 1).data
          // only count the click if it's on a non-transparent pixel
          if (pixel[3] != 0) {
            active_cursor_point = offset_point
            active_piece = piece
            break
          }
        }
      }

      if (active_piece == null) {
        return
      }

      active_piece.style['z-index'] = g.max_z_index++
    }
  }

  document.body.onmouseup = function(e) {
    if (active_piece !== null) {
      active_piece.style['box-shadow'] = 'none'
      match_nearby_pieces(active_piece)
      active_piece = null
    }
  }

  document.body.onmousemove = function(e) {
    if (active_piece !== null) {
      active_piece.style.left = e.x - active_cursor_point.x
      active_piece.style.top = e.y - active_cursor_point.y
    }
  }
}

var main = function() {
  document.body.style['background-color'] = '#534'

  g.image = new Image()
  g.image.src = 'picture.png';
  g.image.onload = function() {
    setup_game()
  }

  // var p = document.createElement('canvas')
  // p.style.top = 0
  // p.style.left = 0
  // p.width = 500
  // p.height = 500
  // p.style.border = '1px solid red'
  // document.body.appendChild(p)
  // var ctx = p.getContext('2d')
  // ctx.translate(100, 100)
  // ctx.beginPath()
  // ctx.moveTo(0,0)
  // console.log(p.to_string())
  // // console.log(p.invert().to_string())
  // //
  // // p.render(ctx)
  // // // p.invert().render(ctx)
  // // ctx.lineTo(200, 0)
  // // // ctx.bezierCurveTo(110,102,130,80,100,0);
  // // // ctx.lineTo(100, 0)
  //
  //
  // ctx.save()
  //
  // ctx.translate(100, 100)
  // ctx.beginPath()
  // ctx.moveTo(0, 0)
  // ctx.rotate(Math.PI / 2)
  // // ctx.scale(-1, -1)
  // for (var d = 0; d < DIRECTIONS; d++) {
  //   p.render(ctx)
  //   ctx.lineTo(PIECE_SIZE, 0)
  //   ctx.translate(PIECE_SIZE, 0)
  //   ctx.rotate(-Math.PI / 2)
  // }
  // ctx.closePath()
  // ctx.fill()
  //
  // ctx.restore()
}

window.onload = main
