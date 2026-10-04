import { Link } from 'react-router-dom';
import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';
import ApiStatus from '../../components/common/ApiStatus.jsx';
import { USER_PATHS } from '../../routes/paths.js';

function Home() {
  return (
    <PagePlaceholder
      title="Find meaningful connections"
      description="A secure social networking and digital matchmaking platform."
    >
      <div className="actions">
        <Link to={USER_PATHS.REGISTER} className="btn btn--primary">
          Get started
        </Link>
        <Link to={USER_PATHS.LOGIN} className="btn">
          Log in
        </Link>
      </div>
      <ApiStatus />
    </PagePlaceholder>
  );
}

export default Home;
