import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import MarkBulb from '../components/bulb'

const mapStateToProps = function(state) {
    return {
        light: state.lightsOn
    }
}
    
export default withRouter(connect(
    mapStateToProps
)(MarkBulb))
